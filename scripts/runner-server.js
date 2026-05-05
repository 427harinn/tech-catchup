const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const host = process.env.RUNNER_SERVER_HOST || '127.0.0.1';
const port = Number(process.env.RUNNER_SERVER_PORT || 3900);
const token = process.env.RUNNER_SERVER_TOKEN || 'runnerServerToken';
const backendApiBaseUrl = process.env.RUNNER_BACKEND_API_BASE_URL || 'http://localhost:3000';

const repoRoot = path.resolve(__dirname, '..');
const logsDir = path.join(repoRoot, 'logs');
const logPath = path.join(logsDir, 'runner-server.log');
const pidPath = path.join(logsDir, 'runner-server.pid');
const scriptDirectory = path.join(repoRoot, 'scripts');
const activeJobTypes = new Set();

const jobHandlers = {
  fetch_and_summarize: {
    script: path.join(scriptDirectory, 'run-fetch-and-summarize-job.ps1')
  },
  summarize_link: {
    unsupported: true,
    message: 'summarize_link is reserved for future implementation.'
  }
};

fs.mkdirSync(logsDir, { recursive: true });
fs.writeFileSync(pidPath, String(process.pid), 'utf8');

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/run-job') {
    await handleRunJob(req, res);
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    writeJson(res, 200, {
      ok: true,
      service: 'runner-server',
      running_job_types: Array.from(activeJobTypes)
    });
    return;
  }

  writeJson(res, 404, { error: 'Not found.' });
});

server.listen(port, host, () => {
  log(`Runner server listening on http://${host}:${port} pid=${process.pid}`);
});

server.on('close', () => {
  safeRemovePidFile();
});

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);
process.on('exit', () => {
  safeRemovePidFile();
});

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  fs.appendFileSync(logPath, `${line}\n`, 'utf8');
}

async function handleRunJob(req, res) {
  if (req.headers['x-runner-token'] !== token) {
    log(`Rejected unauthorized run-job request from=${req.socket.remoteAddress || 'unknown'}`);
    writeJson(res, 401, { error: 'Unauthorized.' });
    return;
  }

  let payload;

  try {
    payload = await readJson(req);
  } catch (error) {
    log(`Rejected invalid JSON request message=${error.message}`);
    writeJson(res, 400, { error: 'Invalid JSON body.' });
    return;
  }

  const jobType = String(payload?.job_type || payload?.type || '').trim();
  const handler = jobHandlers[jobType];

  log(`Received run-job request job_type=${jobType || 'missing'} from=${req.socket.remoteAddress || 'unknown'}`);

  if (!handler) {
    log(`Rejected unsupported job type=${jobType || 'missing'}`);
    writeJson(res, 400, { error: `Unsupported job type: ${jobType}` });
    return;
  }

  if (handler.unsupported) {
    log(`Rejected unimplemented job type=${jobType}`);
    writeJson(res, 501, { error: handler.message });
    return;
  }

  if (activeJobTypes.has(jobType)) {
    log(`Rejected already-running job type=${jobType}`);
    writeJson(res, 409, {
      already_running: true,
      message: `Job type ${jobType} is already running.`
    });
    return;
  }

  startJobProcess(jobType, handler);
  log(`Accepted job type=${jobType}`);

  writeJson(res, 202, {
    accepted: true,
    job_type: jobType,
    message: `Runner accepted job type ${jobType}.`
  });
}

function startJobProcess(jobType, handler) {
  activeJobTypes.add(jobType);
  log(`Starting job type=${jobType} script=${handler.script}`);

  const child = spawn(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      handler.script,
      '-ApiBaseUrl',
      backendApiBaseUrl
    ],
    {
      cwd: repoRoot,
      windowsHide: true
    }
  );

  child.stdout.on('data', (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (line.trim()) {
        log(`[${jobType}] ${line}`);
      }
    }
  });

  child.stderr.on('data', (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (line.trim()) {
        log(`[${jobType}][stderr] ${line}`);
      }
    }
  });

  child.on('error', (error) => {
    log(`Runner child start failure type=${jobType} message=${error.message}`);
    activeJobTypes.delete(jobType);
  });

  child.on('close', (code) => {
    log(`Job process finished type=${jobType} exit_code=${code}`);
    activeJobTypes.delete(jobType);
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 1024 * 32) {
        reject(new Error('Request body too large.'));
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });

    req.on('error', reject);
  });
}

function writeJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function handleShutdown() {
  log('Runner server shutting down.');
  server.close(() => {
    process.exit(0);
  });
}

function safeRemovePidFile() {
  try {
    if (fs.existsSync(pidPath)) {
      fs.unlinkSync(pidPath);
    }
  } catch (error) {
    log(`Failed to remove PID file: ${error.message}`);
  }
}
