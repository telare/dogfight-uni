# Notes 06 — TypeScript як контракт протоколу

Поруч із лабою: [lab-06.md](lab-06.md).

Досліди — у файлі `.ts` + `tsc --strict` (компілятор TypeScript; або Vite). Наводь курсор на типи. На TS-вакансіях питають не синтаксис, а `unknown`, union і «типів на дроті немає».

Етапи здачі (**M1–M4**):

| | Що зробити | Як перевірити |
|---|---|---|
| **M1** | увімкнути TS і пакет `shared/` | клієнт і сервер імпортують одну симуляцію |
| **M2** | один тип повідомлень в обидва боки | нова літера в union ламає `tsc` |
| **M3** | увесь код під `strict` | немає `any` на вході з мережі |
| **M4** | опційно UI-фреймворк + запис | README: що дає фреймворк, чому canvas лишився ванільним |

---

## Ідея

TS стирається до JS. На дроті типів немає. **Структурна** типізація: важлива форма полів, не ім’я класу (на відміну від Java). `any` вимикає перевірку; `unknown` змушує звузити. Повідомлення клієнт ↔ сервер — **discriminated union** (кілька варіантів, поле `type` каже який) + `never` у `default`, щоб нова літера ламала збірку, а не прод.

```mermaid
flowchart LR
  TS[TypeScript] -->|"erased"| JS[JavaScript]
  JS -->|"JSON / binary"| Wire[The wire]
  Wire --> Unknown["unknown + runtime parse"]
  Unknown --> Typed["typed Msg union"]
```

---

## 1. Extra property: змінна vs літерал

```ts
const p = { x: 1, y: 2 }
const q: { x: number } = p // ок: зайве y дозволене через змінну
// const r: { x: number; z: number } = p // помилка: немає z

// const s: { x: number } = { x: 1, y: 2 } // помилка: excess property на літералі
```

**Очікуй:** перше компілюється, літерал із зайвим полем — ні. Це свідоме правило «свіжих» об’єктів, не магія.

---

## 2. `Map.get` під `strict`

```ts
const m = new Map<number, string>()
const s: string = m.get(1)
```

**Очікуй:** помилка, `get` → `string | undefined`. Три фікси: `!` (брешеш компілятору), `?? ''`, `if (s !== undefined)`. Останній найчесніший.

---

## 3. Вичерпність union

```ts
type Msg =
  | { type: 'join'; name: string }
  | { type: 'input'; thrust: boolean }
  | { type: 'ping' }

function handle(m: Msg) {
  switch (m.type) {
    case 'join':
      return m.name
    case 'input':
      return m.thrust
    case 'ping':
      return 0
    default: {
      const _x: never = m
      return _x
    }
  }
}
```

Додай `{ type: 'chat'; text: string }` у union — **Очікуй:** `tsc` підкреслить `never`. Це і є протокол гри.

```mermaid
flowchart TD
  Msg{"m.type"}
  Msg -->|join| Join
  Msg -->|input| Input
  Msg -->|ping| Ping
  Msg -->|"new variant, no case"| Never["never: compile error"]
```

---

## 4. `JSON.parse` — `any`

```ts
const raw: unknown = JSON.parse('{"type":"join"}')
// raw.type // помилка, якщо unknown

import { z } from 'zod'
const schema = z.object({ type: z.literal('join') })
const parsed = schema.safeParse(raw)
if (parsed.success) console.log(parsed.data.type)
```

Межа мережі: zod (або аналог) + типи всередині. Не довіряй клієнту.

---

## 5. `enum` vs union

На свіжому Node `enum` у режимі «лише зрізати типи, не компілювати в JS» часто **не** підтримується. Замість нього:

```ts
const Kind = { ship: 'ship', bullet: 'bullet' } as const
type Kind = (typeof Kind)[keyof typeof Kind]
```

---

## У проєкті

Один пакет `shared/` з симуляцією і типами повідомлень. Клієнт і сервер імпортують його. Мігруєш JS → TS, поведінка runtime не змінюється.

---

## На співбесіді

- Структурна типізація vs номінальна. Extra property check на літералі.
- `any` vs `unknown`. Чому `JSON.parse` небезпечний.
- Discriminated union + `never` у `default` — навіщо.
- Типи стираються. Де тоді валідація вхідного повідомлення.
