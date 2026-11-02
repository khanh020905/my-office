'use client';
import { useEffect } from 'react';

// Starts the small panel (src/panel/main.js) once its markup is on screen: plain JavaScript, no 3D.
export default function PanelBoot() {
  useEffect(() => { import('@/panel/main').then((m) => m.startPanel()); }, []);
  return null;
}
