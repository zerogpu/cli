import { createInterface, type Interface } from "node:readline";
import { Writable } from "node:stream";

export function promptMasked(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let muted = false;
    const output = new Writable({
      write(chunk, _encoding, callback) {
        if (!muted) {
          process.stdout.write(chunk);
        } else {
          const str = chunk.toString("utf8");
          let masked = "";
          for (const ch of str) {
            const code = ch.charCodeAt(0);
            if (code >= 0x20 && code !== 0x7f) {
              masked += "*";
            } else {
              masked += ch;
            }
          }
          process.stdout.write(masked);
        }
        callback();
      },
    });

    const rl: Interface = createInterface({
      input: process.stdin,
      output,
      terminal: true,
    });

    rl.question(question, (answer) => {
      muted = false;
      process.stdout.write("\n");
      rl.close();
      resolve(answer);
    });

    // Mute after the question prompt has been written.
    muted = true;

    rl.on("SIGINT", () => {
      rl.close();
      process.stdout.write("\n");
      reject(new Error("Aborted."));
    });
  });
}

export function promptPlain(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl: Interface = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });

    rl.on("SIGINT", () => {
      rl.close();
      process.stdout.write("\n");
      reject(new Error("Aborted."));
    });
  });
}
