const runnerBaseUrl = process.env.RUNNER_SERVER_URL || 'http://host.docker.internal:3900';
const runnerToken = process.env.RUNNER_SERVER_TOKEN || '';
const notifyTimeoutMs = Number(process.env.RUNNER_SERVER_NOTIFY_TIMEOUT_MS || 3000);

export async function notifyRunnerServer({ jobType }) {
  if (!runnerToken) {
    return {
      attempted: false,
      succeeded: false,
      message: 'Runner server token is not configured.'
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), notifyTimeoutMs);

  try {
    const response = await fetch(`${runnerBaseUrl}/run-job`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-runner-token': runnerToken
      },
      body: JSON.stringify({ job_type: jobType }),
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));

    return {
      attempted: true,
      succeeded: response.ok,
      status_code: response.status,
      data,
      message: data.message || (response.ok ? 'Runner server notified.' : 'Runner server notification failed.')
    };
  } catch (error) {
    return {
      attempted: true,
      succeeded: false,
      message: error.name === 'AbortError'
        ? `Runner server notification timed out after ${notifyTimeoutMs}ms.`
        : `Runner server notification failed: ${error.message}`
    };
  } finally {
    clearTimeout(timeout);
  }
}
