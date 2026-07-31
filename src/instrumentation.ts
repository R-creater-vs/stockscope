/**
 * Next.js runs this once when the server process starts. We use it to launch the
 * alert scheduler — but only in the Node.js runtime, never on the edge (the
 * scheduler touches SQLite and the network, neither of which exists on edge).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startScheduler } = await import('./lib/scheduler');
  startScheduler();
}
