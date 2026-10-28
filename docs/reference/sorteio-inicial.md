# Referência — verificação do sorteio da ordem inicial (`fy-v1`)

O sorteio define a posição inicial de cada Ação de uma Second Home Co-Owner (BR-100, PD-011, TECH-093). A evidência
aparece no Admin e, para os titulares da Second Home, na Área do Titular. Esta página descreve o que a evidência
contém e como conferir o resultado sem depender da Luxtory. Contrato: spec
[`ownership` §16](../specs/ownership.md#16-w9--sorteio-auditável-da-ordem-inicial); decisão:
[ADR-0022](../adr/0022-sorteio-auditavel-e-elegibilidade-temporal-do-outbox.md).

## O que a evidência contém

| Campo | Quando aparece | Significado |
|---|---|---|
| Algoritmo | sempre | `fy-v1` |
| Participantes | sempre | as N Ações, na ordem `1..N` usada pelo algoritmo |
| Compromisso | sempre | `SHA-256(seed)`, em hexadecimal |
| Rede do beacon | sempre | drand quicknet, chain hash `52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971` |
| Rodada alvo `R` e seu instante `t(R)` | sempre | `t(R) = 1692803367 + (R − 1) × 3` segundos Unix |
| Compromisso registrado em / prazo de commit | sempre | o banco só aceita o compromisso se o COMMIT ocorrer até o prazo, e o prazo é anterior a `t(R)` |
| Seed | depois da revelação | 32 bytes, em hexadecimal |
| Assinatura e `randomness` da rodada | depois da revelação | valores publicados pela drand para `R` |
| Resultado | depois da revelação | posição `1..N` de cada Ação |

## Duas provas diferentes

**Reprodução do resultado — verificável por qualquer pessoa.**

1. Obtenha a rodada `R` em qualquer relay da drand (por exemplo
   `https://api.drand.sh/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971/public/R`) e confira que
   assinatura e `randomness` coincidem com a evidência. A assinatura pode ser verificada com a chave pública da rede
   (`/info`) por qualquer cliente drand.
2. Confira que `SHA-256(seed)` é igual ao compromisso.
3. Recalcule o `fy-v1` (abaixo) e compare com o resultado.

**Anterioridade do compromisso — garantia do banco da Luxtory, não prova independente.** O banco recusa um
compromisso cujo COMMIT ocorra depois do prazo, e o prazo antecede `t(R)` por uma folga operacional. Quem guardar o
compromisso, a rodada e o prazo antes de `t(R)` tem uma cópia independente. Até o selo e a ancoragem externa da
auditoria (W30), um superusuário do banco poderia reescrever um compromisso ainda não revelado sem deixar prova
verificável por terceiros.

## Algoritmo `fy-v1`

- `S` = seed (32 bytes); `B` = `randomness` da rodada (32 bytes, `SHA-256` da assinatura); `K = SHA-256(S ‖ B)`.
- `a = [0, 1, …, n − 1]`; para `i` de `n − 1` até `1`: `j = U(K, i, i + 1)` e troca `a[i]` com `a[j]`.
- `U(K, i, m)`: `c = 0`; repetir `h = HMAC-SHA256(K, u32be(i) ‖ u32be(c))`, `x` = `h` como inteiro sem sinal big-endian;
  se `x < 2²⁵⁶ − (2²⁵⁶ mod m)`, devolver `x mod m`; senão `c = c + 1`. O contador recomeça em `0` a cada posição.
- A posição `p` (de `1` a `n`) é da Ação de número `a[p − 1] + 1` na lista de participantes.

Implementação de referência (Python 3, só biblioteca padrão):

```python
import hashlib, hmac

def fy_v1(seed: bytes, randomness: bytes, n: int) -> list[int]:
    key = hashlib.sha256(seed + randomness).digest()
    a = list(range(n))
    for i in range(n - 1, 0, -1):
        m, c = i + 1, 0
        limit = 2**256 - (2**256 % m)
        while True:
            digest = hmac.new(key, i.to_bytes(4, 'big') + c.to_bytes(4, 'big'), hashlib.sha256).digest()
            x = int.from_bytes(digest, 'big')
            if x < limit:
                j = x % m
                break
            c += 1
        a[i], a[j] = a[j], a[i]
    return [x + 1 for x in a]  # posição p → participante a[p − 1]
```

## Vetor fixo

Calculado com a implementação de referência acima, independente do código da aplicação, e reproduzido exatamente pelos
testes (`[TECH-093] vetor fixo reproduz exatamente fy-v1`).

- seed = `SHA-256("luxtory fy-v1 golden vector seed")` =
  `86e8d73b82e993a07b264dc3b86276564e76dabc8886ff73ce79becfdaf71e8c`
- compromisso = `c1eef59bd5525b53abc287e8220a646cefad38cf71b33c22481e75c68233b8c2`
- rodada quicknet real `33474932`, `randomness` =
  `ca93c230825ce92dd4d8dad03ef3d236378647ef62fa670587664cf9c25dcf52`
- `K` = `db7ea2d6761219f4ae3b1c0a442bdacb287933f76b3cb5e5a0e011d85323b2e2`

| n | Participante em cada posição (posições 1..n) |
|---|---|
| 2 | 2, 1 |
| 4 | 2, 3, 1, 4 |
| 8 | 2, 6, 5, 8, 1, 7, 3, 4 |
| 10 | 9, 10, 5, 8, 1, 7, 3, 4, 2, 6 |

A posição na ordem gera só vantagem temporal de acesso, nunca exclusividade sobre datas, e não é usada como penalidade
(BR-104, BR-106, REQ-032).
