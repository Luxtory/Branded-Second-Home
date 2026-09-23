import { spawn } from "node:child_process";

const email = process.env.ULTRONPX_PURCHASE_EMAIL?.trim();

if (!email) {
  throw new Error("ULTRONPX_PURCHASE_EMAIL não está configurado.");
}

const activation = spawn("ultronpx", ["activate", "--email", email], {
  shell: false,
  stdio: "inherit",
});

activation.on("error", (error) => {
  console.error(`Não foi possível executar ultronpx: ${error.message}`);
  process.exitCode = 1;
});

activation.on("exit", (code) => {
  process.exitCode = code ?? 1;
});