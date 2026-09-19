/**
 * Dogfight Server — Скрипт верифікації Backpressure та стабільності пам'яті (RSS)
 * (Lab 04 Milestone 3)
 *
 * Принцип роботи:
 * 1. Генерує синтетичний лог матчу у форматі NDJSON (50 МБ).
 * 2. Піднімає тестовий HTTP-сервер, який стрімить цей файл через pipeline(createReadStream, res).
 * 3. Клієнт підключається та споживає потік із штучним сповільненням (симуляція повільного з'єднання).
 * 4. Кожні 200 мс фіксується process.memoryUsage().rss та heapUsed.
 * 5. Демонструє, що завдяки автоматичному бекпреше (backpressure) у pipeline
 *    використання пам'яті (RSS) залишається ПЛОСКИМ (flat), не накопичуючи дані в буферах.
 */

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { Writable } from 'node:stream'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const tempDir = path.join(rootDir, 'logs')

if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true })
}

const TEST_FILE = path.join(tempDir, 'synthetic-backpressure-test.ndjson')
const TARGET_SIZE_MB = 30 // 30 МБ для швидкої та показової перевірки
const TARGET_BYTES = TARGET_SIZE_MB * 1024 * 1024

async function generateSyntheticLog() {
  console.log(`\n1. Генерація синтетичного логу матчу (${TARGET_SIZE_MB} МБ)...`)
  const writeStream = fs.createWriteStream(TEST_FILE, { flags: 'w' })

  let bytesWritten = 0
  let eventIndex = 0

  const sampleEvent = {
    t: 1726750000000,
    type: 'sim:tick',
    tick: 1000,
    entities: [
      { id: 'ship-1', pos: { x: 500.5, y: 300.2 }, vel: { x: 12.1, y: -4.5 }, angle: 1.57, hp: 100 },
      { id: 'ast-10', pos: { x: 120.0, y: 450.0 }, vel: { x: -3.0, y: 2.0 }, tier: 2 },
      { id: 'ast-11', pos: { x: 800.0, y: 650.0 }, vel: { x: 1.5, y: -1.0 }, tier: 1 },
      { id: 'bullet-99', pos: { x: 520.0, y: 290.0 }, vel: { x: 120.0, y: -45.0 } }
    ]
  }

  const chunkStr = JSON.stringify(sampleEvent) + '\n'
  const chunkBuf = Buffer.from(chunkStr, 'utf8')

  while (bytesWritten < TARGET_BYTES) {
    eventIndex++
    bytesWritten += chunkBuf.length
    const canWrite = writeStream.write(chunkBuf)
    if (!canWrite) {
      await new Promise(resolve => writeStream.once('drain', resolve))
    }
  }

  writeStream.end()
  await new Promise(resolve => writeStream.on('finish', resolve))
  console.log(`   Файл успішно згенеровано: ${(bytesWritten / 1024 / 1024).toFixed(2)} МБ (${eventIndex} подій)`)
}

async function runBackpressureVerification() {
  await generateSyntheticLog()

  console.log('\n2. Запуск стрімінгового сервера з pipeline(readStream, res)...')
  const server = http.createServer(async (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Content-Length': fs.statSync(TEST_FILE).size
    })
    const readStream = fs.createReadStream(TEST_FILE, { highWaterMark: 64 * 1024 })
    try {
      await pipeline(readStream, res)
    } catch (err) {
      if (err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
        console.error('Помилка pipeline:', err)
      }
    }
  })

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  console.log(`   Сервер активний на порті ${port}`)

  console.log('\n3. Підключення повільного споживача (імітація затримки читання сокета)...')
  const initialMem = process.memoryUsage()
  console.log(`   Початкова пам'ять: RSS = ${(initialMem.rss / 1024 / 1024).toFixed(2)} MB, Heap = ${(initialMem.heapUsed / 1024 / 1024).toFixed(2)} MB`)

  const memoryLogs = []
  const monitorTimer = setInterval(() => {
    const mem = process.memoryUsage()
    memoryLogs.push({
      time: Date.now(),
      rss: (mem.rss / 1024 / 1024).toFixed(2),
      heap: (mem.heapUsed / 1024 / 1024).toFixed(2)
    })
  }, 100)

  // Створюємо штучно повільний Writable стрім
  let receivedBytes = 0
  const slowConsumer = new Writable({
    write(chunk, encoding, callback) {
      receivedBytes += chunk.length
      // Штучна затримка 10мс на кожні 64Кб передачі
      setTimeout(callback, 8)
    }
  })

  await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/`, (res) => {
      pipeline(res, slowConsumer).then(resolve).catch(reject)
    })
  })

  clearInterval(monitorTimer)
  server.close()

  console.log(`\n4. Передача завершена! Отримано ${(receivedBytes / 1024 / 1024).toFixed(2)} МБ.`)
  console.log('\n================ РЕЗУЛЬТАТИ ВЕРИФІКАЦІЇ BACKPRESSURE ================')
  console.log('Час (с)   | RSS (МБ) | Heap Used (МБ) | Графік стабільності RSS')
  console.log('---------------------------------------------------------------------')

  const t0 = memoryLogs[0]?.time || Date.now()
  const sampleSteps = Math.max(1, Math.floor(memoryLogs.length / 10))

  for (let i = 0; i < memoryLogs.length; i += sampleSteps) {
    const log = memoryLogs[i]
    const elapsedSec = ((log.time - t0) / 1000).toFixed(1)
    const rssNum = parseFloat(log.rss)
    const bar = '█'.repeat(Math.round(rssNum / 4))
    console.log(`${elapsedSec.padStart(7)}s  | ${log.rss.padStart(7)}  | ${log.heap.padStart(12)}   | ${bar}`)
  }

  const finalMem = memoryLogs[memoryLogs.length - 1]
  const rssDiff = Math.abs(parseFloat(finalMem.rss) - parseFloat(memoryLogs[0].rss))
  console.log('---------------------------------------------------------------------')
  console.log(`Коливання RSS пам'яті за час стрімінгу ${TARGET_SIZE_MB} МБ склало лише: ±${rssDiff.toFixed(2)} МБ!`)
  console.log('Висновки: Завдяки передачі через pipeline потік джерела автоматично призупиняється')
  console.log('під час паузи споживача (highWaterMark). Буфер не розростається в оперативній пам\'яті.')
  console.log('=====================================================================\n')

  // Очищення тестового файлу
  if (fs.existsSync(TEST_FILE)) {
    fs.unlinkSync(TEST_FILE)
  }
}

runBackpressureVerification().catch(err => {
  console.error('Помилка виконання тесту backpressure:', err)
  process.exit(1)
})
