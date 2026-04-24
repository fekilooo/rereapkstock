# GitHub Actions Setup

This project can update the TW fear/greed data automatically with GitHub Actions and publish the result to GitHub Pages.

## What is already prepared

These files are ready:

- `.github/workflows/tw-fear-greed-pages.yml`
- `subprojects/tw-fear-greed-index/tw_fear_greed_1y.py`
- `subprojects/tw-fear-greed-index/requirements.txt`

The workflow will:

1. install Python dependencies
2. restore the last cached output and breadth cache
3. run the 1-year generator script in incremental mode when possible
4. save refreshed cache data for the next run
5. publish the generated files to GitHub Pages

Published files include:

- `tw_fear_greed_1y_latest.json`
- `tw_fear_greed_1y_history.json`
- `tw_fear_greed_1y_history.csv`
- `tw_fear_greed_1y_chart.png`
- `index.html`

## What you need to do in GitHub

### Step 1: push this branch to GitHub

Push the branch that contains these files.

### Step 2: add the repository secret

Open your GitHub repository:

- `Settings`
- `Secrets and variables`
- `Actions`
- `New repository secret`

Create this secret:

- Name: `FINMIND_TOKEN`
- Value: your FinMind token

Important:

- do not put the token in the workflow file
- do not commit the token into the repository
- if the token was already exposed publicly, rotate it first

### Step 3: enable GitHub Pages

Open:

- `Settings`
- `Pages`

Set:

- `Source` -> `GitHub Actions`

You do not need to choose a branch if you use the provided workflow.

### Step 4: run the workflow manually once

Open:

- `Actions`
- choose `TW Fear Greed Pages`
- click `Run workflow`

Optional:

- you can fill `end_date` if you want to test a specific date
- otherwise leave it empty to use the latest available date

### Step 5: wait for the Pages URL

After the workflow succeeds:

- open the workflow run
- open the `Deploy to GitHub Pages` step
- GitHub will show the Pages URL

The Pages root should contain:

- `/index.html`
- `/tw_fear_greed_1y_latest.json`
- `/tw_fear_greed_1y_history.json`
- `/tw_fear_greed_1y_chart.png`

## Suggested APK data URLs

After Pages is enabled, your APK can read:

- `https://<your-account>.github.io/<repo>/tw_fear_greed_1y_latest.json`
- `https://<your-account>.github.io/<repo>/tw_fear_greed_1y_history.json`

For this repository, the final pattern will likely be:

- `https://fekilooo.github.io/rereapkstock/tw_fear_greed_1y_latest.json`
- `https://fekilooo.github.io/rereapkstock/tw_fear_greed_1y_history.json`

Check the actual Pages URL in the workflow run after the first deploy.

## Schedule

The workflow currently runs:

- every weekday at `09:00 UTC`
- which is `17:00` in Taiwan time

It also supports manual runs from the Actions page.

## Notes

- the first run after cache reset is slower because the workflow needs to rebuild the recent history window
- later runs restore the previous output and breadth cache, then only recompute the missing dates plus a small recent tail window
- GitHub Actions secrets must be created by you in GitHub settings
- I can prepare the files, but I cannot press the GitHub web UI buttons on your behalf from here
