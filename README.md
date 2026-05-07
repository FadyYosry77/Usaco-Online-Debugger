# USACO Local Debug Helper

USACO Local Debug Helper adds a simple debugging panel to the USACO Guide IDE so you can practice C++ problems with build, run, debug, input, output, breakpoints, watches, and saved tests in one place.

This tool is for **practice, training, mock contests, and post-contest review only**. Do not use it to break contest rules, automate submissions, or get unfair help during an official live contest.

## How To Use

1. Download this project and open the project folder.
2. Start the helper:
   - Windows: double-click `START_USACO_HELPER.bat`
   - Linux/macOS: run `./START_USACO_HELPER.sh`
3. Open Chrome and go to `chrome://extensions`.
4. Turn on Developer Mode.
5. Click `Load unpacked`.
6. Select the `chrome-extension` folder from this project.
7. Open or refresh your USACO Guide IDE page.

The debugger panel should appear on the USACO Guide IDE page. If it does not appear, click the extension icon or refresh the page once.

If Chrome says the manifest is missing, you selected the wrong folder. Select `chrome-extension`, not the main project folder.

## Features

- Works directly inside the USACO Guide IDE page
- Draggable panel
- Resizable from every edge and corner
- Collapse and expand mode
- Syncs code from the visible editor when possible
- Manual code box if automatic sync is unavailable
- Build C++ solutions
- Run C++ solutions with custom input
- View stdout, stderr, and build output separately
- Save and reload test cases
- Compare output with expected output
- Start a debugging session
- Add and remove breakpoints
- Continue, pause, stop, step over, step into, and step out
- Inspect local variables while paused
- View stack frames while paused
- Add watch expressions
- Choose C++17 or C++11 from Settings

## Quick Tips

- Keep the starter window open while using the tool.
- After loading the extension, refresh the USACO Guide IDE page.
- Use the tool only with code and input you provide yourself.

## More Help

- [START_HERE.md](START_HERE.md)
- [DIRECT_CHROME_EXTENSION.md](DIRECT_CHROME_EXTENSION.md)
