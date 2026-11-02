import { it } from 'vitest'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as current from 'shared'

it('Lab 06 produces exactly the Lab 05 snapshot after 1000 scripted steps', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'dogfight-lab05-'))
  try {
    await writeFile(path.join(directory, 'package.json'), '{"type":"module"}')
    const files = execFileSync(
      'git',
      ['ls-tree', '-r', '--name-only', 'lab-05', 'shared/src/sim'],
      { encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .filter((file) => file.endsWith('.js'))
    for (const file of files)
      await writeFile(
        path.join(directory, path.basename(file)),
        execFileSync('git', ['show', `lab-05:${file}`]),
      )
    const previous = await import(
      pathToFileURL(path.join(directory, 'index.js')).href
    )
    const simulate = ({ World, Ship, Vector2, Entity }) => {
      Entity.resetIdCounter()
      const world = new World({ width: 1200, height: 800, seed: 42 })
      world.spawnInitialAsteroids(4)
      // Use the world's allocator: a hard-coded ID 100 collides with later spawns in Lab 05.
      const ship = world.spawn(
        new Ship({ pos: new Vector2(500, 500), playerId: 'pilot-1' }),
      )
      for (let i = 0; i < 1000; i++)
        world.step(
          1 / 30,
          new Map([
            [
              ship.id,
              {
                thrust: i % 3 === 0 ? 1 : 0,
                turn: Math.sin(i * 0.05),
                fire: i % 10 === 0,
                seq: i + 1,
              },
            ],
          ]),
        )
      return world.getSnapshot(1000, 123, 1000)
    }
    assert.deepEqual(simulate(current), simulate(previous))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
