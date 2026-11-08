package app.kitto.audio

import androidx.media3.common.C
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.SonicAudioProcessor
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

@androidx.media3.common.util.UnstableApi
class TuningTest {
    @Test fun pitchChangesWithoutChangingDuration() {
        val rate = 48000
        val seconds = 6
        for (frequency in listOf(396, 432, 528, 639, 741, 852)) {
            val processor = SonicAudioProcessor()
            processor.setSpeed(1f)
            processor.setPitch(frequency / 440f)
            processor.configure(AudioProcessor.AudioFormat(rate, 2, C.ENCODING_PCM_16BIT))
            processor.flush(AudioProcessor.StreamMetadata.DEFAULT)
            val input = ByteBuffer.allocateDirect(rate * seconds * 4).order(ByteOrder.nativeOrder())
            repeat(rate * seconds) { frame ->
                val sample = (sin(frame * 2 * PI * 440 / rate) * 12000).toInt().toShort()
                input.putShort(sample).putShort(sample)
            }
            input.flip()
            processor.queueInput(input)
            processor.queueEndOfStream()
            val output = ByteArrayOutputStream()
            while (!processor.isEnded) {
                val buffer = processor.output
                val bytes = ByteArray(buffer.remaining())
                buffer.get(bytes)
                output.write(bytes)
            }
            val samples = ByteBuffer.wrap(output.toByteArray()).order(ByteOrder.nativeOrder()).asShortBuffer()
            val frames = samples.remaining() / 2
            assertTrue("$frequency Hz changed duration", abs(frames.toDouble() / rate - seconds) < 0.05)
            val crossings = mutableListOf<Double>()
            for (frame in rate until minOf(frames - 1, rate * 4)) {
                val a = samples[frame * 2].toDouble()
                val b = samples[(frame + 1) * 2].toDouble()
                if (a <= 0 && b > 0) crossings.add(frame + -a / (b - a))
            }
            val measured = (crossings.size - 1) * rate / (crossings.last() - crossings.first())
            assertTrue("$frequency Hz produced $measured Hz", abs(measured - frequency) < 3)
            processor.reset()
        }
    }

    @Test fun originalDisablesPitchProcessing() {
        val processor = SonicAudioProcessor()
        processor.setSpeed(1f)
        processor.setPitch(1f)
        processor.configure(AudioProcessor.AudioFormat(48000, 2, C.ENCODING_PCM_16BIT))
        processor.flush(AudioProcessor.StreamMetadata.DEFAULT)
        assertFalse(processor.isActive)
        processor.reset()
    }
}
