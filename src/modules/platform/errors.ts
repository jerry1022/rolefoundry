/** Safe application failures shared by transport adapters; never expose provider messages. */
export class ApplicationError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
