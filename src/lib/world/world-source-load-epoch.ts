/**
 * Monotonic ownership ticket for asynchronous local World ZIP loads.
 * A newer load or clear invalidates every earlier result, including errors.
 * Does not authenticate archives or authorize any Save operation.
 */
export class WorldSourceLoadEpoch {
  private generation = 0;

  begin():number {
    return ++this.generation;
  }

  invalidate():void {
    ++this.generation;
  }

  isCurrent(ticket:number):boolean {
    return Number.isSafeInteger(ticket) &&
      ticket > 0 && ticket === this.generation;
  }
}
