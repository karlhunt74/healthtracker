# HealthTracker

Meal library and food diary with AI nutrition-label extraction. Plain HTML/CSS/ES modules with one Netlify Function; no dependencies or build command.

## Deploy the upgrade

1. Download a full diary backup from the current app before upgrading.
2. Put the contents of this source folder at the root of `karlhunt74/healthtracker`, preserving the `netlify/functions/` subfolders. Keep the existing icons. `netlify.toml` uses the repository root as the publish directory and `netlify/functions` as the function directory. Leave Netlify's build command empty.
3. In the existing Netlify project's **Project configuration → Environment variables**, add `OPENAI_API_KEY` using your OpenAI API key and `SCAN_ACCESS_TOKEN` using a private random passphrase of at least 16 characters. Scope both to **Functions** if your plan exposes scopes, and mark them as secret. Never put either value in GitHub, HTML, a backup, or a chat message.
4. Optionally set `OPENAI_MODEL`; the default is `gpt-6.1-sol`. A replacement must support image input, the Responses API, strict JSON Schema and `reasoning.effort: low`.
5. Redeploy after changing environment variables. Merely changing them does not update an existing deployment.
6. Open the existing site address. Close and reopen the installed app or refresh to load the upgrade. Add photos, enter the **scan access code** (the `SCAN_ACCESS_TOKEN`, never the API key), and select **Read label with AI**.

The API key exists only in the serverless runtime. The access code protects the paid scan endpoint. Tick **Remember on this device** to store the scan code in this browser and automatically fill it on future visits. Leave it unticked to use it only for the current page. **Forget code**, available beside the scan controls and in Settings, removes the saved code and clears the field. Anyone using the same browser profile can use a remembered scan code; choose the option only on a device you trust. The scan code is never included in diary backups. Netlify team access protection is preserved. There is an additional platform rate limit of 30 requests per hour per site domain. This is a scan throttle, not a dollar spending cap; OpenAI account billing settings remain separate.

## Label and portion behavior

- Up to three photos of one product are resized to at most 2200px and sent to OpenAI only after the user clicks Read label. No automatic retries or paid requests when logging saved meals.
- Structured extraction preserves arbitrary nutrient rows, all printed columns, per-cell units, missing values, less-than bounds, trace values, pack/serving information, ingredients, allergen statements and other visible details. JSON structure does not guarantee correct readings; a review is mandatory.
- Choose a printed per-pack, per-serving or per-100g/ml column. Per-pack options are also calculated from compatible pack weight/volume, a printed serving weight/volume, or the supplied servings-per-pack count, and labelled as calculated. A raw pack weight is never applied to a prepared-food column. Enter or correct the pack amount and serving count if they weren't visible.
- A portion multiplier handles half a pack, multiple servings, or a specific weight (350g from a per-100g column = 3.5). All nutrients use the same portion factor.
- Reference-intake percentages stay in the full saved label but are not added to daily nutrient amounts. Salt and sodium stay separate. Energy kJ and kcal stay separate. Mass units are converted for totals. Missing, trace and less-than amounts do not become exact zeros; coverage is shown for partial totals.
- Existing meals and diary use the same `mealTracker-v1` browser storage key. Old four-macro backups remain supported. New entries snapshot all nutrient amounts, so later meals cannot change earlier entries.
- Backups include the full reviewed label and selected portion, but no photos or credentials. The diary CSV has one row per nutrient per entry, allowing arbitrary nutrients.

## Validation

With Node 20 or newer:

```sh
node --input-type=module -e "import('./tests.mjs').then(async m => console.log(await m.runTests()))"
```

Tests exercise real portion and aggregation code and the function with mocked API responses. They do not make paid API calls. A real label scan still requires a configured API account and deployment; run an end-to-end check with representative labels before relying on recognition quality.

API reference: https://developers.openai.com/api/docs/guides/structured-outputs

Netlify reference: https://docs.netlify.com/build/functions/environment-variables/
