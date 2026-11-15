import { Injectable, signal, computed } from '@angular/core';
import { EditorTab } from '../models/database.models';
import { StorageService } from './storage.service';

const DEFAULT_CONTENT = '';

const SAVE_DEBOUNCE_MS = 400;

@Injectable({
  providedIn: 'root'
})
export class TabManagerService {
  readonly tabs = signal<EditorTab[]>([]);
  readonly activeTabId = signal<string>('');

  readonly activeTab = computed(() => {
    const list = this.tabs();
    const id = this.activeTabId();
    return list.find(t => t.id === id) || list[0] || null;
  });

  private pendingSaves = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private storageService: StorageService) {}

  async init(): Promise<void> {
    await this.storageService.init();
    const savedTabs = await this.storageService.getTabs();
    if (savedTabs.length > 0) {
      this.tabs.set(savedTabs.map(t => ({ ...t, isDirty: false })));
      const lastActive = safeGet('sqllab_active_tab');
      this.activeTabId.set(savedTabs.some(t => t.id === lastActive) ? lastActive! : savedTabs[0].id);
    } else {
      const defaultTab: EditorTab = {
        id: 'tab_consultas',
        title: 'consulta.sql',
        content: DEFAULT_CONTENT,
        isDirty: false,
        database: 'principal'
      };
      this.tabs.set([defaultTab]);
      this.activeTabId.set(defaultTab.id);
      await this.persist(defaultTab);
    }
  }

  createTab(title?: string, content: string = '', database: string = ''): EditorTab {
    const id = 'tab_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const newTab: EditorTab = {
      id,
      title: this.uniqueTitle(title || 'consulta.sql'),
      content,
      isDirty: false,
      database
    };

    this.tabs.set([...this.tabs(), newTab]);
    this.setActiveTab(id);
    void this.persist(newTab);
    return newTab;
  }

  closeTab(id: string): void {
    const current = this.tabs();
    if (current.length <= 1) return; // Siempre queda al menos una pestaña

    const idx = current.findIndex(t => t.id === id);
    const updated = current.filter(t => t.id !== id);
    this.tabs.set(updated);
    this.cancelPendingSave(id);
    void this.storageService.removeTab(id);

    if (this.activeTabId() === id) {
      this.setActiveTab(updated[Math.max(0, idx - 1)].id);
    }
  }

  renameTab(id: string, title: string): void {
    const clean = title.trim().replace(/[\\/:*?"<>|]/g, '_');
    if (!clean) return;
    const finalTitle = /\.sql$/i.test(clean) ? clean : clean + '.sql';
    this.tabs.set(this.tabs().map(t => (t.id === id ? { ...t, title: finalTitle } : t)));
    const tab = this.tabs().find(t => t.id === id);
    if (tab) void this.persist(tab);
  }

  setActiveTab(id: string): void {
    this.activeTabId.set(id);
    safeSet('sqllab_active_tab', id);
  }

  /** Actualiza el contenido de la pestaña activa y lo guarda en segundo plano. */
  updateActiveTabContent(content: string): void {
    const id = this.activeTab()?.id;
    if (!id) return;
    const current = this.tabs().find(t => t.id === id);
    if (!current || current.content === content) return;

    const updatedTab = { ...current, content, isDirty: true };
    this.tabs.set(this.tabs().map(t => (t.id === id ? updatedTab : t)));
    this.scheduleSave(id);
  }

  /** Guarda inmediatamente la pestaña activa y la marca como guardada. */
  async saveActiveTab(): Promise<EditorTab | null> {
    const tab = this.activeTab();
    if (!tab) return null;
    this.cancelPendingSave(tab.id);
    const saved = { ...tab, isDirty: false };
    this.tabs.set(this.tabs().map(t => (t.id === tab.id ? saved : t)));
    await this.persist(saved);
    return saved;
  }

  /** Carga un fragmento SQL: reemplaza la pestaña activa si está vacía o es la de bienvenida; si no, abre una nueva. */
  loadSnippet(sql: string, title?: string): void {
    const active = this.activeTab();
    if (active && (!active.content.trim() || active.content === DEFAULT_CONTENT)) {
      this.updateActiveTabContent(sql);
    } else {
      this.createTab(title || 'ejercicio.sql', sql);
    }
  }

  private scheduleSave(id: string): void {
    this.cancelPendingSave(id);
    this.pendingSaves.set(
      id,
      setTimeout(() => {
        this.pendingSaves.delete(id);
        const tab = this.tabs().find(t => t.id === id);
        if (!tab) return;
        // El contenido queda persistido: la pestaña deja de estar "sin guardar"
        const saved = { ...tab, isDirty: false };
        this.tabs.set(this.tabs().map(t => (t.id === id ? saved : t)));
        void this.persist(saved);
      }, SAVE_DEBOUNCE_MS)
    );
  }

  private cancelPendingSave(id: string): void {
    const handle = this.pendingSaves.get(id);
    if (handle) {
      clearTimeout(handle);
      this.pendingSaves.delete(id);
    }
  }

  private async persist(tab: EditorTab): Promise<void> {
    const order = this.tabs().findIndex(t => t.id === tab.id);
    try {
      await this.storageService.saveTab({ ...tab, order: order === -1 ? this.tabs().length : order });
    } catch (e) {
      console.warn('No se pudo guardar la pestaña:', e);
    }
  }

  private uniqueTitle(base: string): string {
    const titles = new Set(this.tabs().map(t => t.title));
    if (!titles.has(base)) return base;
    const stem = base.replace(/\.sql$/i, '');
    let i = 2;
    while (titles.has(`${stem}_${i}.sql`)) i++;
    return `${stem}_${i}.sql`;
  }
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignorar
  }
}
