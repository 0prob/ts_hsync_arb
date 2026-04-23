export function createBackgroundTaskTracker() {
  const tasks = new Set<Promise<void>>();

  function track(task: Promise<void>) {
    tasks.add(task);
    void task
      .catch(() => {})
      .finally(() => {
        tasks.delete(task);
      });
    return task;
  }

  async function waitForIdle() {
    while (tasks.size > 0) {
      await Promise.allSettled([...tasks]);
    }
  }

  return {
    track,
    waitForIdle,
    size: () => tasks.size,
  };
}
