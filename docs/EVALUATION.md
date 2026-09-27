# NLP & system evaluation

Everything here is reproducible from the repository — no proprietary data is required.

```bash
pip install -r ml/requirements.txt
npm run ml:train          # fit + export src/nlp/intentClassifier/model.json
npm run ml:eval-intent    # accuracy / precision / recall / F1 / confusion matrix + baseline comparison
npm run ml:wer            # Word Error Rate per noise environment
```

Artefacts are written to:

| File | Contents |
|------|----------|
| `src/nlp/intentClassifier/model.json` | Weights that ship on the phone (vocab, IDF, coefficients) |
| `ml/metrics/train_metrics.json` | Held-out metrics from training |
| `ml/metrics/intent_metrics.json` | Full comparison + confusion matrices |
| `ml/metrics/asr_wer.json` | WER and command-recovery rate per environment |

---

## 1. Intent classification

### 1.1 Dataset

`ml/data/commands.jsonl` — one JSON object per line:

```json
{"text": "make the music louder", "intent": "INCREASE_VOLUME"}
```

Current size: **187 utterances** across 10 intents (including `UNKNOWN`). Each intent has
10–20 natural variations, the brief's exact phrasings, and deliberately corrupted variants that
simulate ASR damage under noise (`"increse volum"`, `"play song number heaven"`, `"paws the music"`).

Held-out test set: **57 utterances**, stratified, `random_state=42`, `test_size=0.3`.

### 1.2 Model

```
TfidfVectorizer(ngram_range=(1,2), token_pattern=r"(?u)\b\w+\b", norm="l2", smooth_idf=True)
  -> LogisticRegression(max_iter=5000, C=10, class_weight="balanced")
```

`src/nlp/intentClassifier/classifier.ts` reproduces the vectorizer transform exactly (unigrams +
adjacent bigrams, IDF weighting, L2 normalisation) and then applies softmax over the linear
decision function. That is what makes the held-out numbers meaningful for the shipped app instead of
just for a notebook.

### 1.3 Metrics

Standard definitions, computed on the held-out split:

* **Accuracy** = correct / total
* **Precision** = TP / (TP + FP) per intent
* **Recall** = TP / (TP + FN) per intent
* **F1** = harmonic mean of precision and recall
* **Macro F1** = unweighted mean of per-intent F1 (fair with small classes)
* **Confusion matrix** = truth (rows) × prediction (columns)

### 1.4 Results (held-out, 57 utterances)

| Approach | Accuracy | Macro F1 | Notes |
|----------|---------:|---------:|-------|
| Exact / rule-based | 0.842 | 0.788 | keyword containment (multi-word only) + fuzzy fallback |
| Fuzzy only | 0.842 | 0.788 | maximum phrase similarity, no keywording |
| ML only | 0.754 | 0.751 | TF-IDF + Logistic Regression |
| **Hybrid (ships in app)** | **0.860** | **0.865** | `0.65·ML + 0.35·rules` |

**Interpretation.**

* The **hybrid wins**, which is exactly the design hypothesis: statistics generalise to unseen
  phrasings, curated vocabulary keeps hard cases (especially the corrupted volume commands) sharp.
* **ML alone loses to fuzzy** here, and that is an honest result worth keeping: with ~130 training
  utterances, corrupted forms such as `"increse volum"` sometimes fall in the test split, so those
  exact tokens are unseen at fit time and the classifier must fall back on priors. On-device this is
  exactly where the fuzzy matcher and the confidence engine earn their keep.
* The composite pipeline is what makes the *system* reliable, not any single classifier.

**To push ML accuracy higher:** grow `commands.jsonl` (200+ per intent), add more corruption
variants per variant, or add character n-grams (`analyzer="char_wb"`, `ngram_range=(2,5)`) — the last
requires mirroring the char n-gram extractor in `classifier.ts`.

### 1.5 Adding data safely

1. Append lines to `ml/data/commands.jsonl`.
2. `npm run ml:train && npm run ml:eval-intent`.
3. Commit `model.json` **and** the regenerated metrics together, so the reported numbers match the
   shipped artefact.

Keep the lexicon in `src/nlp/shared/*.json` as the single source of truth: the app and the Python
harness both read those files, which is what prevents train/serve skew.

---

## 2. ASR robustness (Word Error Rate)

### 2.1 Method

`ml/data/asr_samples.jsonl` holds paired `reference`/`hypothesis` transcripts per environment:

```json
{"environment": "wind", "reference": "increase volume", "hypothesis": "increse volum", "intent": "INCREASE_VOLUME"}
```

WER is the token-level Levenshtein distance divided by reference length. The harness additionally
reports **command recovery**: the fraction of corrupted hypotheses from which the NLP layer still
derives the correct intent.

### 2.2 Results

| Environment | WER | Command recovered |
|-------------|----:|------------------:|
| Quiet | 0.000 | 100% |
| Music playing | 0.000 | 100% |
| Wind | 0.517 | 100% |
| Engine | 0.667 | 100% |
| Traffic | 0.417 | 100% |
| **Overall** | **0.320** | **100%** |

**Interpretation.** Recognition degrades badly in wind/engine conditions (up to 67% of words wrong),
yet the intended command survives, because normalization + fuzzy matching + context reconstruct the
meaning. This is the project's central claim, and it is measurable.

### 2.3 Recording your own samples

On a real ride, log the ASR output and the intended command (Ride Mode already keeps
`lastTranscript` and `lastIntent`). Append the pairs to `asr_samples.jsonl` with an environment tag
and re-run `npm run ml:wer`. This is the intended path from synthetic to field-measured results.

---

## 3. Adaptive Audio calibration

The dBFS zone thresholds in `src/adaptiveAudio/config.ts` are deliberately **not** treated as
universal — microphone gain differs per phone, and a helmet changes everything.

Procedure:

1. With Ride Mode active and Adaptive Audio **off**, watch `Ambient noise` in Ride Mode (or log
   `noiseZone`/`smoothedDbfs`).
2. Record the smoothed level in: a quiet room, light traffic, a stationary idling bike, then at
   riding speed with wind.
3. Move the four boundaries (`moderateDb`, `noisyDb`, `veryNoisyDb`, `extremeDb`) so they land
   between those measured levels.
4. If the volume moves too often, raise `hysteresisDwellMs` / `cooldownMs`; if it reacts too slowly,
   shorten `smoothingWindowMs`.

Automated checks worth adding: feed a synthetic dBFS ramp into `AdaptiveAudioController` and assert
the applied deltas respect zone, cap and cooldown.

---

## 4. System performance (how to measure)

The brief asks for latency, resource use and false-activation counts. Measure them like this:

| Metric | How |
|--------|-----|
| ASR latency | `AsrResult.latencyMs` (already returned by every provider) |
| NLP latency | wrap `interpretCommand()` / read the `handled in Nms` debug log |
| Spotify API latency | time `spotifyRequest()` (React Native network inspector / `logger.debug`) |
| End-to-end latency | log timestamps at `speech-end` and at "track actually changed" |
| CPU / RAM | Android Studio Profiler or Xcode Instruments against a development build |
| Battery | Android `dumpsys batterystats`, iOS Energy Log, on a 30-minute ride |
| False activations | count dispatches with intent ≠ the spoken one while not speaking |
| Missed commands | count `decision === 'reject'`/`'confirm'` for utterances the rider considers valid |

`src/utils/logger.ts` prefixes every subsystem (`[VoiceRiders:voice:asr]`), so a single
`npx expo start` console gives a readable trace of the whole pipeline.

---

## 5. Test environments

The ASR/NLP stack should be exercised in all six conditions listed in the brief:

1. Quiet (baseline)
2. Music playing through the same phone's speaker
3. Wind
4. Engine
5. Traffic
6. Multiple voices / conversation

For each: record WER (section 2) and command success rate (section 1.4 + section 4).
