import { createInterface, type Interface } from "node:readline";
import { Writable } from "node:stream";

export function promptMasked(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let muted = false;
    const output = new Writable({
      write(chunk, _encoding, callback) {
        if (!muted) {
          process.stdout.write(chunk);
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
