import { Injectable, signal } from '@angular/core';

export type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'sqllab_theme';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  readonly currentTheme = signal<ThemeMode>('dark');

  init(): void {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      // almacenamiento no disponible
    }
    if (saved === 'dark' || saved === 'light') {
      this.apply(saved);
    } else {
      // Tema oscuro por defecto: es el diseño principal de la aplicación
      this.apply('dark');
    }
  }

  setTheme(theme: ThemeMode): void {
    this.apply(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignorar
    }
  }

  toggleTheme(): void {
    this.setTheme(this.currentTheme() === 'dark' ? 'light' : 'dark');
  }

  private apply(theme: ThemeMode): void {
    this.currentTheme.set(theme);
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('light', theme === 'light');
    root.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0B0F19' : '#F8FAFC');
  }
}
