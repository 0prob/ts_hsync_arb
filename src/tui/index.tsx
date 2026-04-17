import React from 'react';
import { render } from 'ink';
import { App } from './App.tsx';

export interface TuiState {
  passCount: number;
  consecutiveErrors: number;
  gasPrice: string;
  maticPrice: string;
  lastArbMs: number;
  opportunities: any[];
  logs: string[];
  status: 'idle' | 'running' | 'error';
}

let tuiInstance: any = null;
let currentState: TuiState = {
  passCount: 0,
  consecutiveErrors: 0,
  gasPrice: '0',
  maticPrice: 'N/A',
  lastArbMs: 0,
  opportunities: [],
  logs: [],
  status: 'idle',
};

export function startTui() {
  if (tuiInstance) return;
  tuiInstance = render(<App initialState={currentState} />);
}

export function updateTui(newState: Partial<TuiState>) {
  currentState = { ...currentState, ...newState };
  if (tuiInstance) {
    tuiInstance.rerender(<App initialState={currentState} />);
  }
}

export function addLog(message: string) {
  const logs = [message, ...currentState.logs].slice(0, 10);
  updateTui({ logs });
}

export function addOpportunity(opportunity: any) {
  const opportunities = [opportunity, ...currentState.opportunities].slice(0, 5);
  updateTui({ opportunities });
}
