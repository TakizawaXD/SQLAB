import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none select-none">
      @for (toast of notifications.toasts(); track toast.id) {
        <div 
          class="pointer-events-auto p-3.5 rounded-xl border shadow-2xl backdrop-blur-md flex items-start gap-3 transition-all animate-bounce-in"
          [class.bg-emerald-950/90]="toast.type === 'success'"
          [class.border-emerald-500/50]="toast.type === 'success'"
          [class.text-emerald-100]="toast.type === 'success'"
          [class.bg-rose-950/90]="toast.type === 'error'"
          [class.border-rose-500/50]="toast.type === 'error'"
          [class.text-rose-100]="toast.type === 'error'"
          [class.bg-amber-950/90]="toast.type === 'warning'"
          [class.border-amber-500/50]="toast.type === 'warning'"
          [class.text-amber-100]="toast.type === 'warning'"
          [class.bg-slate-900/90]="toast.type === 'info'"
          [class.border-slate-700/80]="toast.type === 'info'"
          [class.text-slate-100]="toast.type === 'info'">
          
          <!-- Icon -->
          <div class="shrink-0 mt-0.5">
            @if (toast.type === 'success') {
              <svg class="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            } @else if (toast.type === 'error') {
              <svg class="w-4 h-4 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
            } @else if (toast.type === 'warning') {
              <svg class="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            } @else {
              <svg class="w-4 h-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
            }
          </div>

          <!-- Message -->
          <div class="flex-1 min-w-0 text-xs">
            <h5 class="font-semibold">{{ toast.title }}</h5>
            <p class="text-[11px] opacity-90 mt-0.5 break-words">{{ toast.message }}</p>
          </div>

          <!-- Close button -->
          <button 
            (click)="notifications.dismiss(toast.id)"
            class="shrink-0 p-1 rounded hover:bg-black/20 opacity-60 hover:opacity-100">
            ✕
          </button>
        </div>
      }
    </div>
  `
})
export class ToastComponent {
  constructor(public notifications: NotificationService) {}
}
