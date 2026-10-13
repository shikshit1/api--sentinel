import http from 'node:http';
import type { AddressInfo } from 'node:net';

export class MockTargetApi {
  private server: http.Server | null = null;
  private port: number = 0;

  public async start(): Promise<string> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const pathname = url.pathname;
        const method = (req.method || 'GET').toUpperCase();

        // 1. Slow endpoint for timeout testing
        if (pathname === '/slow') {
          setTimeout(() => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ message: 'Delayed response' }));
          }, 4000);
          return;
        }

        // 2. Huge payload endpoint for byte limit testing
        if (pathname === '/huge') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          // Write 1.5MB of data in chunks
          const chunk = 'X'.repeat(64 * 1024);
          for (let i = 0; i < 25; i++) {
            res.write(chunk);
          }
          res.end();
          return;
        }

        // 3. Redirect endpoint to verify redirect blocking
        if (pathname === '/redirect') {
          res.writeHead(302, {
            Location: '/tasks',
            'Content-Type': 'text/plain',
          });
          res.end('Redirecting to /tasks');
          return;
        }

        // 4. Server Error endpoint
        if (pathname === '/error') {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal Server Error' }));
          return;
        }

        // 5. Schema violation endpoint
        if (pathname === '/tasks/schema-violation') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          // Contract expects { id: string, title: string }, returning wrong types
          res.end(JSON.stringify({ id: 12345, title: 99999, completed: 'not_a_boolean' }));
          return;
        }

        // 6. Normal GET /tasks
        if (pathname === '/tasks' && method === 'GET') {
          const statusQuery = url.searchParams.get('status');
          if (statusQuery && !['pending', 'completed'].includes(statusQuery)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid status enum' }));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify([
              { id: 'task-1', title: 'Task One', completed: false },
              { id: 'task-2', title: 'Task Two', completed: true },
            ])
          );
          return;
        }

        // 7. POST /tasks
        if (pathname === '/tasks' && method === 'POST') {
          let bodyRaw = '';
          req.on('data', (c) => (bodyRaw += c));
          req.on('end', () => {
            let body: any = {};
            try {
              body = JSON.parse(bodyRaw);
            } catch {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Malformed JSON' }));
              return;
            }

            if (!body.title) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Missing required field title' }));
              return;
            }

            if (typeof body.title !== 'string') {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'title must be a string' }));
              return;
            }

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                id: 'task-new',
                title: body.title,
                completed: Boolean(body.completed),
              })
            );
          });
          return;
        }

        // 8. GET /tasks/:id
        if (pathname.startsWith('/tasks/') && method === 'GET') {
          const id = pathname.replace('/tasks/', '');
          if (id === 'not-found') {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Task not found' }));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              id,
              title: `Task ${id}`,
              completed: false,
            })
          );
          return;
        }

        // Default 404
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Route not found' }));
      });

      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server?.address() as AddressInfo;
        this.port = addr.port;
        resolve(`http://127.0.0.1:${this.port}`);
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  public getBaseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }
}
