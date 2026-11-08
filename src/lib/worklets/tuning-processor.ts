import {
    SoundTouchProcessorBase,
    STANDARD_PARAMETER_DESCRIPTORS,
    type ProcessCoreResult,
} from "@soundtouchjs/worklet-base";


import {
    registerInterpolationStrategy,
} from "@soundtouchjs/core";

import {
    lanczosStrategy,
} from "@soundtouchjs/interpolation-strategy-lanczos"

registerInterpolationStrategy(lanczosStrategy);

class KittoTuningProcessor extends SoundTouchProcessorBase {
    private resetPending = false;
    private disposed = false;

    static get parameterDescriptors() {
        return STANDARD_PARAMETER_DESCRIPTORS;
    }

    constructor() {
        super("[KittoTuning]", {
            sampleRate,
            sampleBufferType: "circular",
            interpolationStrategy: "lanczos",
        });

        this.port.addEventListener("message", (event: MessageEvent) => {
            if (event.data?.type === "reset") {
                this.resetPending = true;
            }

            if (event.data?.type === "dispose") {
                this.disposed = true;
            }
        });

        this.port.start();
    }


    protected onProcessComplete(result: ProcessCoreResult): void {
        if (this._blockCount % 100 !== 0) return;

        this.port.postMessage({
            type: "metrics",
            framesBuffered: result.available,
            underrunCount: this._underrunCount,
            blockCount: this._blockCount,
            outputRms: result.outputRms,
            outputPeak: result.outputPeak, 
        });
    }

    process(
        inputs: Float32Array[][],
        outputs: Float32Array[][],
        parameters: Record<string, Float32Array>,
    ): boolean {
        if (this.disposed) {
            this._pipe.clear();
            return false;
        }

        if (this.resetPending) {
            this._pipe.clear();
            this._blockCount = 0;
            this._underrunCount = 0;
            this.resetPending = false;
        }


        return super.process(inputs, outputs, parameters);
    }
}

registerProcessor("soundtouch-processor", KittoTuningProcessor);
