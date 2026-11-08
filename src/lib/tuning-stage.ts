import processorUrl from "./worklets/tuning-processor.ts?worker&url"
import { tuningRatio, type TuningTarget } from "./tuning"

export function createTuningStage(
    context: AudioContext,
    isPlaying: () => boolean,
    onError: () => void,
) {
    const input = context.createGain();
    const output = context.createGain();
    const original = context.createGain();
    const processed = context.createGain();

    original.gain.value = 1;
    processed.gain.value = 0;

    input.connect(original);
    original.connect(output);
    processed.connect(output);

    let node: AudioWorkletNode | null = null;
    let registration: Promise<void> | null = null;
    let target: TuningTarget = null;
    let operation: Promise<void> = Promise.resolve();
    let revision = 0;
    let disposed = false;
    let failure: Error | null = null;

    function route(useProcessed: boolean) {
        const now = context.currentTime;
        const playing = isPlaying();
        const warmup = 
            playing && useProcessed && processed.gain.value < 0.5
                ? 0.18
                : 0;

        for (const [parameter, value] of [
            [original.gain, useProcessed ? 0 : 1],
            [processed.gain, useProcessed ? 1 : 0],
        ] as const) {
            parameter.cancelScheduledValues(now);

            if (!playing) {
                parameter.setValueAtTime(value, now);
            } else {
                parameter.setValueAtTime(parameter.value, now);
                parameter.setValueAtTime(parameter.value, now + warmup);
                parameter.linearRampToValueAtTime(
                    value,
                    now + warmup + 0.04,
                );
            }
        }
    }

    function discardFailedNode() {
        if (!node) return;

        input.disconnect(node);
        node.disconnect();
        node.port.close();
        node = null;
    }


    async function ensureNode(): Promise<AudioWorkletNode> {
        if (!context.audioWorklet) {
            throw new Error("Audio processing is unavailable")
        } 

        if (!registration) {
            registration = context.audioWorklet
                .addModule(processorUrl)
                .catch((error) => {
                    registration = null;
                    throw error;
                });
        }

        await registration;

        if (disposed) {
            throw new Error("Audio processing was closed.");
        }


        if (!node) {
            const created = new AudioWorkletNode(
                context,
                "soundtouch-processor",
                {
                    numberOfInputs: 1,
                    numberOfOutputs: 1,
                    outputChannelCount: [2],
                    parameterData: {
                        pitch: 1,
                        pitchSemitones: 0,
                        playbackRate: 1,
                    },
                },
            );

            created.port.onmessage = () => {};

            created.addEventListener("processorerror", () => {
                if (disposed || node !== created) return;
                
                failure = new Error("Pitch processing stopped.");

                if (target !== null) {
                    original.gain.cancelScheduledValues(context.currentTime);
                    processed.gain.cancelScheduledValues(context.currentTime);
                    original.gain.value = 0;
                    processed.gain.value = 0;
                    onError();
                }
            });

            input.connect(created);
            created.connect(processed);
            node = created;
        }

        return node;
    }


    async function apply(next: TuningTarget, expected: number) {
        if (failure) discardFailedNode();
        failure = null;

        if (next === null) {
            route(false);
            return;
        }

        const current = await ensureNode();

        if (disposed || expected !== revision) return;

        const pitch = current.parameters.get("pitch");

        if (!pitch) {
            throw new Error("Pitch control is unavailable");
        }

        const now = context.currentTime;
        pitch.cancelScheduledValues(now);

        if  (isPlaying()) {
            pitch.setValueAtTime(pitch.value, now);
            pitch.setTargetAtTime(tuningRatio(next), now, 0.04);
        } else {
            pitch.setValueAtTime(tuningRatio(next), now);
        }

        route(true);
    }

    function setTarget(next: TuningTarget): Promise<void> {
        if (disposed) {
            return Promise.reject(new Error("Audio processing was closed"));
        }

        if (next === target && !failure) return operation;

        target = next;
        const expected = ++revision;

        operation = apply(next, expected).catch((error: unknown) => {
            if (expected === revision) {
                failure = error instanceof Error
                    ? error
                    : new Error("Could not configure pitch processing");
            }

            throw error;
        });

        void operation.catch(() => {});
        return operation;
    }

    async function ready(): Promise<void> {
        while (!disposed) {
            const current = operation;

            try {
                await current;
            } catch (error) {
                if (current === operation) throw error;
                continue;
            }

            if (current === operation) {
                if (target !== null && failure) throw failure;
                return;
            }
        }

        throw new Error("Audio processing was closed.");
    }

    function reset() {
        node?.port.postMessage({ type: "reset" });
    }

    function dispose() {
        if (disposed) return;

        disposed = true;
        revision++;

        node?.port.postMessage({ type: "dispose" });
        node?.disconnect();
        input.disconnect();
        original.disconnect();
        processed.disconnect();
        output.disconnect();
    }

    return {
        input,
        output,
        setTarget,
        ready,
        reset,
        dispose,
    };
}
