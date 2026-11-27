export const poseSpeeds = [1, 0.75, 0.5, 0.25] as const;
export type PoseSpeed = typeof poseSpeeds[number];
export interface PoseSampleTarget {
  /** Sample the entire synchronized rig at absolute seconds, including hidden actors. */
  sample(seconds: number): void;
  /** Change drawing visibility only; never disable an animator, bone or constraint. */
  setVisible(actorId: string, visible: boolean): void;
}
export interface PosePlaybackState {
  readonly time: number;
  readonly duration: number;
  readonly playing: boolean;
  readonly loop: boolean;
  readonly speed: PoseSpeed;
}
export class PosePlayback {
  private state: PosePlaybackState;
  private readonly target: PoseSampleTarget;
  constructor(duration: number, target: PoseSampleTarget) {
    this.target = target;
    if (!Number.isFinite(duration) || duration <= 0) throw new RangeError('Invalid pose duration');
    this.state = {time: 0, duration, playing: false, loop: true, speed: 1};
    this.target.sample(0);
  }
  get snapshot(): PosePlaybackState { return {...this.state}; }
  play(): void {
    if (this.state.time === this.state.duration) this.seek(0);
    this.state = {...this.state, playing: true};
  }
  pause(): void { this.state = {...this.state, playing: false}; }
  restart(): void { this.seek(0); this.play(); }
  setLoop(loop: boolean): void { this.state = {...this.state, loop}; }
  setSpeed(speed: PoseSpeed): void {
    if (!poseSpeeds.includes(speed)) throw new RangeError('Invalid pose speed');
    this.state = {...this.state, speed};
  }
  seek(seconds: number): void {
    if (!Number.isFinite(seconds)) throw new RangeError('Invalid pose time');
    const time = Math.min(this.state.duration, Math.max(0, seconds));
    this.target.sample(time);
    this.state = {...this.state, time};
  }
  tick(elapsedSeconds: number): void {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) throw new RangeError('Invalid elapsed time');
    if (!this.state.playing || elapsedSeconds === 0) return;
    const {time, duration, loop, speed} = this.state;
    const next = time + elapsedSeconds * speed;
    if (next >= duration && !loop) {
      this.seek(duration);
      this.pause();
    } else {
      this.seek(next % duration);
    }
  }
  setActorVisible(actorId: string, visible: boolean): void {
    if (!actorId) throw new RangeError('Invalid actor ID');
    this.target.setVisible(actorId, visible);
  }
}
