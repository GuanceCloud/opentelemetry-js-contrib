'use strict';

const { fork } = require('child_process');
const path = require('path');
const axios = require('axios').default;

const PORT = Number(process.env.DEMO_PORT || '18080');
const APP_URL = `http://127.0.0.1:${PORT}`;
const FINAL_WAIT_MS = Number(process.env.FINAL_WAIT_MS || '7000');

async function main() {
  const child = fork(path.join(__dirname, 'app.js'), {
    env: process.env,
    stdio: 'inherit',
  });

  try {
    await waitForReady();
    const summary = await axios.get(`${APP_URL}/__summary`);
    console.log('[runner] demo summary:');
    console.log(JSON.stringify(summary.data, null, 2));

    const scenarios = [
      { cpuMs: 160, allocMb: 8, pauseMs: 60 },
      { cpuMs: 220, allocMb: 12, pauseMs: 90 },
      { cpuMs: 280, allocMb: 16, pauseMs: 120 },
      { cpuMs: 180, allocMb: 10, pauseMs: 70 },
    ];

    for (const scenario of scenarios) {
      const response = await axios.get(`${APP_URL}/work`, {
        params: scenario,
      });
      console.log('[runner] work response:');
      console.log(JSON.stringify(response.data, null, 2));
    }

    const profileResponse = await axios.post(`${APP_URL}/__collect-profile`);
    console.log('[runner] collect-profile response:');
    console.log(JSON.stringify(profileResponse.data, null, 2));

    console.log(
      `[runner] waiting ${FINAL_WAIT_MS}ms for periodic metric export before shutdown`
    );
    await sleep(FINAL_WAIT_MS);
  } finally {
    await terminate(child);
  }
}

async function waitForReady() {
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    try {
      await axios.get(`${APP_URL}/health`, { timeout: 500 });
      return;
    } catch {
      await sleep(250);
    }
  }
  throw new Error(`demo app did not become ready at ${APP_URL}`);
}

async function terminate(child) {
  if (child.exitCode !== null || child.killed) {
    return;
  }

  child.kill('SIGTERM');
  await new Promise(resolve => {
    child.once('exit', () => {
      resolve();
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

main().catch(error => {
  console.error('[runner] demo failed:', error);
  process.exit(1);
});
