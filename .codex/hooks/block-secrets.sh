#!/usr/bin/env bash
# .claude/hooks/block-secrets.sh
# PreToolUse hook — bloqueia operações em arquivos/comandos sensíveis.
#
# Contrato:
#   - Lê JSON do stdin com tool_input
#   - Exit 0  = permitir
#   - Exit 2  = BLOCK (stderr vai pro Claude como contexto)
#   - Outros  = erro de hook (não bloqueia, loga warning)
#
# Fail-closed: como "outros" códigos NÃO bloqueiam, toda falha ao ler ou interpretar o input (node ausente, JSON
# inválido, campo com tipo inesperado) sai com 2. Nunca usar `set -e` aqui: um erro inesperado viraria exit 1
# e liberaria a operação. O JSON é interpretado com `node` (dependência do projeto; `jq` não existe no ambiente).
#
# ref: docs.claude.com/en/docs/claude-code/hooks

set -uo pipefail

block() {
  echo "[block-secrets] BLOCKED: $1" >&2
  exit 2
}

# Lê input do Claude Code via stdin
INPUT=$(cat) || block "não foi possível ler o input do hook (fail-closed)"
command -v node >/dev/null 2>&1 || block "node indisponível para interpretar o input do hook (fail-closed)"

# Imprime "ok", tool_name, tool_input.file_path e tool_input.command separados por NUL. Sai com erro (sem
# imprimir nada) se o input não for um objeto JSON com tool_input objeto ou se algum campo não for string.
PARSER='
let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  const input = JSON.parse(raw);
  const toolInput = input && typeof input === "object" ? input.tool_input : undefined;
  if (!toolInput || typeof toolInput !== "object") process.exit(1);
  const text = (value) => {
    if (value === undefined || value === null) return "";
    if (typeof value !== "string" || value.includes("\0")) process.exit(1);
    return value;
  };
  const fields = ["ok", text(input.tool_name), text(toolInput.file_path), text(toolInput.command)];
  process.stdout.write(fields.join("\0") + "\0");
});
'
STATUS='' TOOL_NAME='' FILE_PATH='' COMMAND=''
{ IFS= read -r -d '' STATUS && IFS= read -r -d '' TOOL_NAME && IFS= read -r -d '' FILE_PATH &&
  IFS= read -r -d '' COMMAND; } < <(printf '%s' "$INPUT" | node -e "$PARSER" 2>/dev/null)
[[ "$STATUS" == "ok" ]] || block "input do hook inválido ou ilegível (fail-closed)"

# Patterns proibidos — adicione aqui o que for sensível no seu projeto
DENY_PATTERNS=(
  '\.env$'
  '\.env\.'
  'secrets/'
  'credentials\.json'
  'service-account.*\.json'
  'id_rsa'
  'id_ed25519'
  '\.pem$'
  '\.p12$'
  '\.pfx$'
  '/\.aws/'
  '/\.config/gcloud/'
  '/\.ssh/'
  '/\.kube/config'
)

# Comandos perigosos que merecem bloqueio mesmo se path estiver ok
DANGEROUS_COMMANDS=(
  'rm -rf /'
  'rm -rf ~'
  'rm -rf \$HOME'
  ':(){ :|:& };:'              # fork bomb
  'dd if=/dev/zero of=/dev/'
  'mkfs\.'
  'chmod -R 777 /'
)

# Verifica file_path
if [[ -n "$FILE_PATH" ]]; then
  for pattern in "${DENY_PATTERNS[@]}"; do
    if [[ "$FILE_PATH" =~ $pattern ]]; then
      echo "[block-secrets] BLOCKED: file_path '$FILE_PATH' casa com pattern proibido '$pattern'" >&2
      echo "[block-secrets] tool: $TOOL_NAME" >&2
      exit 2
    fi
  done
fi

# Verifica command (para tool Bash)
if [[ -n "$COMMAND" ]]; then
  # Patterns sensíveis no comando inteiro
  for pattern in "${DENY_PATTERNS[@]}"; do
    if [[ "$COMMAND" =~ $pattern ]]; then
      echo "[block-secrets] BLOCKED: command toca em path sensível ('$pattern')" >&2
      echo "[block-secrets] command: $COMMAND" >&2
      exit 2
    fi
  done

  # Patterns destrutivos
  for pattern in "${DANGEROUS_COMMANDS[@]}"; do
    if [[ "$COMMAND" =~ $pattern ]]; then
      echo "[block-secrets] BLOCKED: comando destrutivo detectado ('$pattern')" >&2
      exit 2
    fi
  done
fi

exit 0
