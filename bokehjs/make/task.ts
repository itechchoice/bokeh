import chalk from "chalk"

export class BuildError extends Error {
  constructor(readonly component: string, message: string) {
    super(message)
  }
}

export function log(message: string): void {
  const now = new Date().toTimeString().split(" ")[0]
  console.log(`[${chalk.gray(now)}] ${message}`)
}

export type Fn<T> = () => Promise<T>

class Task<T = any> {
  constructor(readonly name: string,
              readonly deps: string[],
              readonly fn?: Fn<T>) {}
}

const tasks = new Map<string, Task>()

export function task<T>(name: string, deps: string[] | Fn<T>, fn?: Fn<T>): void {
  if (!Array.isArray(deps)) {
    fn = deps
    deps = []
  }

  const t = new Task<T>(name, deps, fn)
  tasks.set(name, t)
}

export function task_names(): string[] {
  return Array.from(tasks.keys())
}

function* resolve_task(name: string, parent?: Task): Iterable<Task> {
  const [prefix, suffix] = name.split(":", 2)

  if (prefix == "*") {
    for (const task of tasks.values()) {
      if (task.name.endsWith(`:${suffix}`)) {
        yield task
      }
    }
  } else if (tasks.has(name)) {
    yield tasks.get(name)!
  } else {
    let message = `unknown task '${chalk.cyan(name)}'`
    if (parent != null)
     message += ` referenced from '${chalk.cyan(parent.name)}'`
    throw new Error(message)
  }
}

async function exec_task(task: Task): Promise<unknown> {
  if (task.fn == null) {
    log(`Finished '${chalk.cyan(task.name)}'`)
    return undefined
  } else {
    log(`Starting '${chalk.cyan(task.name)}'...`)
    const start = Date.now()
    let result: unknown = undefined
    let error: Error | undefined = undefined
    try {
      result = await task.fn()
    } catch (err) {
      error = err
    }
    const end = Date.now()
    const diff = end - start
    const duration = diff >= 1000 ? `${(diff / 1000).toFixed(2)} s` : `${diff} ms`
    log(`${error ? "Failed" : "Finished"} '${chalk.cyan(task.name)}' after ${chalk.magenta(duration)}`)
    return result
  }
}

export async function run(...names: string[]): Promise<void> {
  const finished = new Map<Task, unknown>()

  async function _run(task: Task) {
    if (finished.has(task)) {
      return finished.get(task)
    } else {
      for (const name of task.deps) {
        for (const dep of resolve_task(name, task)) {
          await _run(dep)
        }
      }
      const result = await exec_task(task)
      finished.set(task, result)
      return result
    }
  }

  for (const name of names) {
    for (const task of resolve_task(name)) {
      await _run(task)
    }
  }
}
