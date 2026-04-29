/**
 * SkyState class — manages observer position, date, time, and related state.
 * Encapsulates all sky observation parameters.
 */

import { DEFAULT_OBSERVER } from '../config/defaults';
import type { SkyState, ResolvedPlace } from '../types';

export class SkyStateManager {
  private state: SkyState;

  constructor(initial?: Partial<SkyState>) {
    this.state = {
      ...DEFAULT_OBSERVER,
      ...initial,
    };
  }

  get(): SkyState {
    return { ...this.state };
  }

  set(newState: Partial<SkyState>): void {
    this.state = { ...this.state, ...newState };
  }

  updateFromPlace(place: ResolvedPlace): void {
    this.state.placeName = place.name;
    this.state.latitude = place.latitude;
    this.state.longitude = place.longitude;
    this.state.timeZone = place.timeZone;
  }

  updateDate(date: string, time: string): void {
    this.state.date = date;
    this.state.time = time;
  }

  updateLocation(latitude: number, longitude: number, placeName: string): void {
    this.state.latitude = latitude;
    this.state.longitude = longitude;
    this.state.placeName = placeName;
  }

  updateElevation(elevation: number): void {
    this.state.elevation = elevation;
  }

  getObserverPosition(): [number, number, number] {
    return [this.state.latitude, this.state.longitude, this.state.elevation];
  }
}
