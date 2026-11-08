import {
    defaultEqualizer,
    equalizerBands,
    normalizeEqualizer,
    type EqualizerSettings,
} from "./equalizer";
import { createTuningStage } from "./tuning-stage";
import { parseTuningTarget, type TuningTarget } from "./tuning";


type EqualizerGraph = {
    context: AudioContext;
    tuning: ReturnType<typeof createTuningStage>;
    filters: BiquadFilterNode[];
    probe: BiquadFilterNode;
    preamp: GainNode;
    dry: GainNode;
    wet: GainNode;
    frequencies: Float32Array<ArrayBuffer>;
    magnitudes: Float32Array<ArrayBuffer>;
    phases: Float32Array<ArrayBuffer>;
    curve: Float64Array<ArrayBuffer>;
};


function setParameter(
    parameter: AudioParam,
    value: number,
    time: number,
    immediate: boolean,
    smoothing = 0.02,
) {

    if (immediate) {
        parameter.value = value;
        return;
    }

    const current = parameter.value;

    parameter.cancelScheduledValues(time);
    parameter.setValueAtTime(current, time);
    parameter.setTargetAtTime(value, time, smoothing);
}



function createGraph(audio: HTMLAudioElement, onError: () => void): EqualizerGraph {
    const context = new AudioContext();
    const nyquist = context.sampleRate / 2;
    const preamp = context.createGain();
    const dry = context.createGain();
    const wet = context.createGain();
    dry.gain.value = 1;
    wet.gain.value = 0;

    const filters = equalizerBands.map((band, index) => {
        const filter = context.createBiquadFilter();

        filter.type =
            index === 0
                ? "lowshelf"
                : index === equalizerBands.length - 1
                    ? "highshelf"
                    : "peaking";

        filter.frequency.value = Math.min(
            band.frequency,
            nyquist * 0.95,
        );
        filter.Q.value = 1.4;
        filter.gain.value = 0;

        return filter;
    });

    let previous: AudioNode = preamp;
    for (const filter of filters) {
        previous.connect(filter);
        previous = filter;
    }

    previous.connect(wet);
    wet.connect(context.destination);
    dry.connect(context.destination);

    const source = context.createMediaElementSource(audio);
    const tuning = createTuningStage(context, () => !audio.paused, onError);
    source.connect(tuning.input);
    tuning.output.connect(preamp);
    tuning.output.connect(dry);

    const frequencies = new Float32Array(1024);
    const maximum = nyquist - 1;
    for (let index = 0; index < frequencies.length; index++) {
        frequencies[index] = Math.pow(
            maximum,
            index / (frequencies.length - 1),
        );
    }

    return {
        context,
        tuning,
        filters,
        probe: context.createBiquadFilter(),
        preamp,
        dry,
        wet,
        frequencies,
        magnitudes: new Float32Array(frequencies.length),
        phases: new Float32Array(frequencies.length),
        curve: new Float64Array(frequencies.length),
    };
}

function automaticPreamp(
  graph: EqualizerGraph,
  gains: number[],
): number {
  graph.curve.fill(0);

  graph.filters.forEach((filter, bandIndex) => {
    graph.probe.type = filter.type;
    graph.probe.frequency.value = filter.frequency.value;
    graph.probe.Q.value = filter.Q.value;
    graph.probe.gain.value = gains[bandIndex];

    graph.probe.getFrequencyResponse(
      graph.frequencies,
      graph.magnitudes,
      graph.phases,
    );

    for (let index = 0; index < graph.curve.length; index++) {
      const magnitude = graph.magnitudes[index];

      if (Number.isFinite(magnitude) && magnitude > 0) {
        graph.curve[index] += 20 * Math.log10(magnitude);
      }
    }
  });

  let peak = 0;

  for (const gain of graph.curve) {
    peak = Math.max(peak, gain);
  }

  return peak > 0.01 ? -peak - 1 : 0;
}


export function createEqualizerEngine(audio: HTMLAudioElement, onError: () => void = () => {}) {
  let settings = defaultEqualizer();
  let graph: EqualizerGraph | null = null;
  let tuningTarget: TuningTarget = null;

  function apply(immediate = false) {
    if (!graph) return;

    const current = graph;
    const nyquist = current.context.sampleRate / 2;

    const gains = equalizerBands.map((band, index) =>
      band.frequency < nyquist ? settings.gains[index] : 0,
    );

    const preampDb = settings.autoPreamp
      ? automaticPreamp(current, gains)
      : settings.preamp;

    const preampGain = Math.pow(10, preampDb / 20);
    const time = current.context.currentTime;

    setParameter(
      current.preamp.gain,
      preampGain,
      time,
      immediate,
      preampGain < current.preamp.gain.value ? 0.005 : 0.06,
    );

    current.filters.forEach((filter, index) => {
      setParameter(
        filter.gain,
        gains[index],
        time,
        immediate,
      );
    });

    setParameter(
      current.dry.gain,
      settings.enabled ? 0 : 1,
      time,
      immediate,
    );

    setParameter(
      current.wet.gain,
      settings.enabled ? 1 : 0,
      time,
      immediate,
    );
  }

  function configure(next: EqualizerSettings) {
    settings = normalizeEqualizer(next);
    apply();
  }

  function prepare() {
    if (!graph) {
      graph = createGraph(audio, onError);
      apply(true);
    }
    return graph;
  }

  async function resume() {
    const current = prepare();
    const waking = current.context.state === "running" ? Promise.resolve() : current.context.resume();
    void current.tuning.setTarget(tuningTarget).catch(() => {});
    await Promise.all([waking, current.tuning.ready()]);
  }

  function configureTuning(target: TuningTarget): Promise<void> {
    tuningTarget = parseTuningTarget(target);
    return prepare().tuning.setTarget(tuningTarget);
  }

  function resetTuning() {
    graph?.tuning.reset();
  }

  function dispose() {
    if (!graph) return;
    graph.tuning.dispose();
    void graph.context.close().catch(() => {});
    graph = null;
  }

  return {
    configure,
    configureTuning,
    resetTuning,
    prepare,
    resume,
    dispose,
  };
}
