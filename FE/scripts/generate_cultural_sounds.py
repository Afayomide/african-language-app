#!/usr/bin/env python3

from __future__ import annotations

import math
import os
import random
import struct
import wave
from dataclasses import dataclass

SAMPLE_RATE = 44_100


@dataclass(frozen=True)
class Stroke:
    start: float
    base_freq: float
    length: float
    intensity: float
    bend: float
    pan: float


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def normalize(stereo: list[tuple[float, float]], peak: float = 0.92) -> list[tuple[float, float]]:
    if not stereo:
        return stereo
    current_peak = max(max(abs(left), abs(right)) for left, right in stereo)
    if current_peak <= 0.0001:
        return stereo
    gain = peak / current_peak
    return [(left * gain, right * gain) for left, right in stereo]


def smooth_noise(seed: int, length: int) -> list[float]:
    random.seed(seed)
    values: list[float] = []
    last = 0.0
    for _ in range(length):
        target = random.uniform(-1.0, 1.0)
        last = last * 0.82 + target * 0.18
        values.append(last)
    return values


def membrane_stroke(stroke: Stroke, total_samples: int, noise_seed: int) -> list[tuple[float, float]]:
    start_sample = int(stroke.start * SAMPLE_RATE)
    duration_samples = max(1, int(stroke.length * SAMPLE_RATE))
    body_noise = smooth_noise(noise_seed, duration_samples)
    out = [(0.0, 0.0) for _ in range(total_samples)]

    left_gain = clamp(0.55 - stroke.pan * 0.25, 0.15, 0.85)
    right_gain = clamp(0.55 + stroke.pan * 0.25, 0.15, 0.85)

    for i in range(duration_samples):
      idx = start_sample + i
      if idx >= total_samples:
        break

      t = i / SAMPLE_RATE
      progress = i / duration_samples

      attack = min(1.0, i / max(1, int(0.002 * SAMPLE_RATE)))
      decay = math.exp(-6.3 * progress)
      envelope = attack * decay * stroke.intensity

      pitch = stroke.base_freq * (1.0 + stroke.bend * math.exp(-10.0 * progress))
      fundamental = math.sin(2.0 * math.pi * pitch * t)
      second = 0.62 * math.sin(2.0 * math.pi * pitch * 1.86 * t + 0.3)
      third = 0.28 * math.sin(2.0 * math.pi * pitch * 2.72 * t + 1.1)
      slap = body_noise[i] * 0.18 * math.exp(-24.0 * progress)
      body = fundamental + second + third + slap

      ring = 0.10 * math.sin(2.0 * math.pi * (pitch * 3.8) * t) * math.exp(-12.0 * progress)
      sample = (body + ring) * envelope

      left, right = out[idx]
      out[idx] = (left + sample * left_gain, right + sample * right_gain)

    return out


def combine_layers(total_duration: float, strokes: list[Stroke]) -> list[tuple[float, float]]:
    total_samples = int(total_duration * SAMPLE_RATE)
    stereo = [(0.0, 0.0) for _ in range(total_samples)]

    for noise_seed, stroke in enumerate(strokes, start=1):
        layer = membrane_stroke(stroke, total_samples, noise_seed * 97)
        stereo = [
            (left + layer_left, right + layer_right)
            for (left, right), (layer_left, layer_right) in zip(stereo, layer)
        ]

    return normalize(stereo)


def write_stereo_wav(path: str, stereo: list[tuple[float, float]]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "wb") as wav_file:
        wav_file.setnchannels(2)
        wav_file.setsampwidth(2)
        wav_file.setframerate(SAMPLE_RATE)
        frames = bytearray()
        for left, right in stereo:
            frames.extend(
                struct.pack(
                    "<hh",
                    int(clamp(left, -1.0, 1.0) * 32767),
                    int(clamp(right, -1.0, 1.0) * 32767),
                )
            )
        wav_file.writeframes(bytes(frames))


def yoruba_celebration_pattern() -> list[Stroke]:
    return [
        Stroke(0.00, 142.0, 0.26, 0.95, 0.18, -0.28),
        Stroke(0.16, 228.0, 0.17, 0.72, 0.10, 0.24),
        Stroke(0.31, 192.0, 0.19, 0.76, 0.14, 0.10),
        Stroke(0.49, 148.0, 0.28, 1.00, 0.20, -0.18),
        Stroke(0.70, 246.0, 0.16, 0.68, 0.08, 0.30),
        Stroke(0.84, 204.0, 0.18, 0.73, 0.10, -0.05),
        Stroke(1.02, 154.0, 0.30, 1.00, 0.22, -0.22),
        Stroke(1.24, 266.0, 0.18, 0.70, 0.06, 0.26),
        Stroke(1.38, 178.0, 0.32, 0.92, 0.18, 0.02),
    ]


def yoruba_proverb_pattern() -> list[Stroke]:
    return [
        Stroke(0.00, 132.0, 0.34, 0.88, 0.14, -0.12),
        Stroke(0.28, 208.0, 0.16, 0.52, 0.08, 0.18),
        Stroke(0.56, 145.0, 0.30, 0.80, 0.12, 0.06),
        Stroke(0.90, 188.0, 0.17, 0.48, 0.07, -0.22),
        Stroke(1.12, 138.0, 0.40, 0.92, 0.16, 0.10),
    ]


def main() -> None:
    base_dir = os.path.join(os.path.dirname(__file__), "..", "public", "sounds", "yoruba")
    celebration = combine_layers(1.85, yoruba_celebration_pattern())
    proverb = combine_layers(1.65, yoruba_proverb_pattern())

    write_stereo_wav(os.path.join(base_dir, "celebration.wav"), celebration)
    write_stereo_wav(os.path.join(base_dir, "proverb.wav"), proverb)

    print("Generated:")
    print(os.path.join(base_dir, "celebration.wav"))
    print(os.path.join(base_dir, "proverb.wav"))


if __name__ == "__main__":
    main()
