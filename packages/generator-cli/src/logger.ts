export class Logger {
  readonly verbose: boolean;
  readonly quiet: boolean;

  constructor(verbose = false, quiet = false) {
    this.verbose = verbose;
    this.quiet = quiet;
  }

  step(name: string): void {
    if (this.quiet) return;
    console.log(`\n▶ ${name}`);
  }

  info(message: string): void {
    if (this.quiet) return;
    console.log(message);
  }

  warn(message: string): void {
    console.warn(`[warn] ${message}`);
  }

  error(message: string): void {
    console.error(message);
  }

  debug(message: string): void {
    if (this.verbose) console.log(`[debug] ${message}`);
  }
}
