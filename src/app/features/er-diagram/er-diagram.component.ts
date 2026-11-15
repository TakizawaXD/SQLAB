import { 
  Component, 
  ElementRef, 
  ViewChild, 
  signal, 
  computed, 
  effect, 
  untracked,
  EventEmitter, 
  Output 
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { SqlEngineService } from '../../core/services/sql-engine.service';
import { TableSchema } from '../../core/models/database.models';

interface NodePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RelationshipLine {
  id: string;
  sourceTable: string;
  sourceCol: string;
  targetTable: string;
  targetCol: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  pathD: string;
  oneX: number;
  oneY: number;
  nX: number;
  nY: number;
  cardinalityStart: '1' | 'N';
  isOneToOne: boolean;
}

@Component({
  selector: 'app-er-diagram',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div 
      #container
      (mousedown)="onCanvasMouseDown($event)"
      (mousemove)="onCanvasMouseMove($event)"
      (mouseup)="onCanvasMouseUp()"
      class="relative w-full h-full overflow-hidden er-canvas-grid select-none cursor-grab active:cursor-grabbing">
      
      <!-- Transform Canvas Wrapper for Pan and Zoom -->
      <div 
        class="absolute origin-top-left transition-transform duration-75"
        [style.transform]="'translate(' + panX() + 'px, ' + panY() + 'px) scale(' + zoom() + ')'">
        
        <!-- SVG Layer for Bezier Relationship Lines & Cardinality Badges -->
        <svg class="absolute top-0 left-0 w-[5000px] h-[5000px] pointer-events-none z-0">
          <defs>
            <filter id="glow-line" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          @for (rel of relationshipLines(); track rel.id) {
            <g>
              <!-- Glowing shadow line -->
              <path 
                [attr.d]="rel.pathD" 
                fill="none" 
                [attr.stroke]="rel.isOneToOne ? '#10b981' : '#6366f1'" 
                stroke-width="4" 
                opacity="0.3" 
                filter="url(#glow-line)" />

              <!-- Main relation curve (solid for 1:1, dashed for 1:N) -->
              <path 
                [attr.d]="rel.pathD" 
                fill="none" 
                [attr.stroke]="rel.isOneToOne ? '#34d399' : '#38bdf8'" 
                stroke-width="2" 
                [attr.stroke-dasharray]="rel.isOneToOne ? null : '6,4'" />

              <!-- Cardinality '1' badge on target PK side -->
              <circle [attr.cx]="rel.endX" [attr.cy]="rel.endY" r="8" fill="#1e293b" [attr.stroke]="rel.isOneToOne ? '#34d399' : '#38bdf8'" stroke-width="1.5" />
              <text 
                [attr.x]="rel.endX" 
                [attr.y]="rel.endY + 3.5" 
                font-size="10" 
                font-weight="bold" 
                [attr.fill]="rel.isOneToOne ? '#34d399' : '#38bdf8'" 
                text-anchor="middle">
                1
              </text>

              <!-- Cardinality '1' or 'N' badge on source FK side -->
              <circle [attr.cx]="rel.startX" [attr.cy]="rel.startY" r="8" fill="#1e293b" [attr.stroke]="rel.isOneToOne ? '#34d399' : '#a855f7'" stroke-width="1.5" />
              <text 
                [attr.x]="rel.startX" 
                [attr.y]="rel.startY + 3.5" 
                font-size="10" 
                font-weight="bold" 
                [attr.fill]="rel.isOneToOne ? '#34d399' : '#c084fc'" 
                text-anchor="middle">
                {{ rel.cardinalityStart }}
              </text>
            </g>
          }
        </svg>

        <!-- HTML Table Nodes Layer -->
        <div class="relative z-10">
          @for (table of sqlEngine.currentSchema().tables; track tableKey(table)) {
            @if (tablePositions()[tableKey(table)]; as pos) {
              <div 
                (mousedown)="onNodeMouseDown(tableKey(table), $event)"
                (click)="onTableClick(table, $event)"
                [style.transform]="'translate(' + pos.x + 'px, ' + pos.y + 'px)'"
                [style.width.px]="pos.width"
                [class.ring-2]="selectedTable()?.name === table.name && selectedTable()?.schema === table.schema"
                [class.ring-purple-400]="selectedTable()?.name === table.name && selectedTable()?.schema === table.schema"
                class="absolute rounded-xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden cursor-move transition-shadow hover:shadow-cyan-500/10">
                
                <!-- Table Header -->
                <div class="er-card-header px-3 py-2 flex items-center justify-between gap-2 text-white border-b border-blue-500/30">
                  <div class="flex items-center gap-1.5 min-w-0">
                    <svg class="w-4 h-4 text-cyan-300 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect width="18" height="18" x="3" y="3" rx="2"></rect>
                      <path d="M3 9h18M9 9v12"></path>
                    </svg>
                    <span class="font-bold text-xs tracking-wide truncate font-mono uppercase">{{ table.name }}</span>
                    @if (table.schema && table.schema !== 'public') {
                      <span class="text-[9px] px-1 py-0.5 rounded bg-slate-900/70 text-indigo-200 border border-indigo-400/30 font-mono shrink-0">
                        {{ table.schema }}
                      </span>
                    }
                    @if (isJoinTable(table)) {
                      <span title="Tabla asociativa N:M" class="text-[9px] px-1 py-0.5 rounded bg-fuchsia-500/25 text-fuchsia-200 border border-fuchsia-400/40 font-mono font-bold shrink-0">
                        N:M
                      </span>
                    }
                  </div>
                  <span class="text-[10px] bg-blue-950/80 px-1.5 py-0.5 rounded text-cyan-300 font-mono shrink-0">{{ table.rowCount }}</span>
                </div>

                <!-- Table Columns List -->
                <div class="p-2 space-y-1 bg-slate-950/90 text-xs font-mono">
                  @for (col of table.columns; track col.name) {
                    <div class="flex items-center justify-between gap-1.5 px-1.5 py-0.5 rounded hover:bg-slate-800/60">
                      <!-- Left: Key icon & Column name -->
                      <div class="flex items-center gap-1.5 min-w-0">
                        @if (col.isPrimaryKey) {
                          <svg class="w-3.5 h-3.5 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                            <path d="m21 2-2 2m-1.5 1.5L14 9l-1.5-1.5L11 9l1.5 1.5L11 12l1.5 1.5-3.5 3.5a5 5 0 1 1-1.41-1.41L11 12l-1.5-1.5 1.5-1.5L9.5 7.5 11 6l1.5 1.5L14 6l1.5 1.5L17 6l1.5 1.5L20 6l1-1z"/>
                          </svg>
                        } @else if (col.isForeignKey) {
                          <svg class="w-3 h-3 text-cyan-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                          </svg>
                        } @else {
                          <span class="w-3 h-3 inline-block shrink-0"></span>
                        }
                        <span 
                          [class.text-amber-300]="col.isPrimaryKey"
                          [class.font-semibold]="col.isPrimaryKey"
                          [class.text-cyan-200]="col.isForeignKey"
                          [class.text-slate-300]="!col.isPrimaryKey && !col.isForeignKey"
                          class="truncate">
                          {{ col.name }}
                        </span>
                      </div>

                      <!-- Right: Constraint Pills + Data Type -->
                      <div class="flex items-center gap-1 shrink-0">
                        @if (col.isUnique && !col.isPrimaryKey) {
                          <span class="text-[8px] px-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">UQ</span>
                        }
                        @if (!col.nullable && !col.isPrimaryKey) {
                          <span class="text-[8px] px-1 rounded bg-slate-800 text-slate-400 border border-slate-700">NN</span>
                        }
                        <span class="text-[10px] text-slate-500 uppercase">{{ col.type }}</span>
                      </div>
                    </div>
                  }
                </div>

                <!-- Card Footer with Constraint / Relationship Summary -->
                <div class="px-3 py-1 bg-slate-900/95 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                  <span>{{ table.columns.length }} col · {{ table.constraints?.length || 0 }} restr.</span>
                  @if (table.foreignKeys.length > 0) {
                    <span class="text-cyan-400/80">{{ table.foreignKeys.length }} FK</span>
                  }
                </div>
              </div>
            }
          }
        </div>
      </div>

      @if (sqlEngine.currentSchema().tables.length === 0) {
        <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div class="bg-slate-900/85 border border-slate-800 rounded-xl px-5 py-4 text-center max-w-sm">
            <p class="text-sm font-semibold text-slate-200 mb-1">Sin tablas en {{ sqlEngine.currentDbName() }}</p>
            <p class="text-xs text-slate-400">Ejecuta un <code class="text-cyan-300">CREATE TABLE</code> para generar automáticamente las tarjetas y relaciones ER.</p>
          </div>
        </div>
      }

      <!-- Floating Controls (+, -, Fit, Reorganizar) -->
      <div class="absolute right-4 bottom-4 flex flex-col gap-1.5 bg-slate-900/90 border border-slate-700/80 rounded-xl p-1 shadow-2xl backdrop-blur-md z-20">
        <button 
          (click)="zoomIn()" 
          title="Acercar (+)"
          class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
        <button 
          (click)="zoomOut()" 
          title="Alejar (-)"
          class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
        <button 
          (click)="fitView()" 
          title="Ajustar a pantalla"
          class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 3 21 3 21 9"></polyline>
            <polyline points="9 21 3 21 3 15"></polyline>
            <line x1="21" y1="3" x2="14" y2="10"></line>
            <line x1="3" y1="21" x2="10" y2="14"></line>
          </svg>
        </button>
        <button 
          (click)="reorganizeLayout()" 
          title="Reorganizar tarjetas"
          class="w-7 h-7 flex items-center justify-center rounded-lg text-cyan-300 hover:text-white hover:bg-slate-800 transition-colors">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect width="7" height="7" x="3" y="3" rx="1"></rect>
            <rect width="7" height="7" x="14" y="3" rx="1"></rect>
            <rect width="7" height="7" x="14" y="14" rx="1"></rect>
            <rect width="7" height="7" x="3" y="14" rx="1"></rect>
          </svg>
        </button>
      </div>
    </div>
  `
})
export class ErDiagramComponent {
  @ViewChild('container') containerRef!: ElementRef<HTMLDivElement>;
  @Output() tableSelected = new EventEmitter<TableSchema>();

  zoom = signal<number>(0.9);
  panX = signal<number>(40);
  panY = signal<number>(30);

  selectedTable = signal<TableSchema | null>(null);

  // Positions dictionary for table nodes
  tablePositions = signal<Record<string, NodePosition>>({});

  // Dragging state
  private isDraggingCanvas = false;
  private isDraggingNode: string | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private nodeStartX = 0;
  private nodeStartY = 0;
  private lastDbName = '';

  constructor(public sqlEngine: SqlEngineService) {
    // Whenever tables, active project, or active DB change, arrange positions without circular effect triggers
    effect(() => {
      const scopeKey = `${this.sqlEngine.currentProjectId()}:${this.sqlEngine.currentDbName()}`;
      const tables = this.sqlEngine.currentSchema().tables;
      untracked(() => {
        this.recomputeLayout(tables, scopeKey);
      });
    });
  }

  tableKey(table: Pick<TableSchema, 'schema' | 'name'>): string {
    return `${table.schema || 'public'}.${table.name}`;
  }

  isJoinTable(table: TableSchema): boolean {
    if (table.foreignKeys.length < 2) return false;
    const distinctTargets = new Set(table.foreignKeys.map(fk => fk.targetTable));
    if (distinctTargets.size < 2) return false;
    const pkOrFkCount = table.columns.filter(c => c.isPrimaryKey || c.isForeignKey).length;
    return pkOrFkCount >= 2;
  }

  recomputeLayout(
    tables: TableSchema[],
    scopeKey = `${this.sqlEngine.currentProjectId()}:${this.sqlEngine.currentDbName()}`,
    forceReset = false
  ): void {
    let current = forceReset ? {} : { ...untracked(() => this.tablePositions()) };
    const colWidth = 260;
    const paddingX = 75;
    let changed = forceReset;

    if (scopeKey !== this.lastDbName) {
      current = {};
      this.selectedTable.set(null);
      this.lastDbName = scopeKey;
      changed = true;
    }

    const activeKeys = new Set(tables.map(t => this.tableKey(t)));
    for (const existingKey of Object.keys(current)) {
      if (!activeKeys.has(existingKey)) {
        delete current[existingKey];
        changed = true;
      }
    }

    const existingCount = Object.keys(current).length;
    let col = existingCount % 3;
    let row = Math.floor(existingCount / 3);

    for (const t of tables) {
      const key = this.tableKey(t);
      const height = 40 + t.columns.length * 24 + 36;
      if (!current[key]) {
        changed = true;
        current[key] = {
          x: 40 + col * (colWidth + paddingX),
          y: 40 + row * 240,
          width: colWidth,
          height
        };

        col++;
        if (col >= 3) {
          col = 0;
          row++;
        }
      } else if (current[key].height !== height) {
        changed = true;
        current[key] = { ...current[key], height };
      }
    }

    if (changed) {
      this.tablePositions.set(current);
    }
  }

  // Compute curved Bezier lines between foreign key columns
  relationshipLines = computed<RelationshipLine[]>(() => {
    const tables = this.sqlEngine.currentSchema().tables;
    const positions = this.tablePositions();
    const lines: RelationshipLine[] = [];

    for (const sourceTable of tables) {
      const sourceKey = this.tableKey(sourceTable);
      const sourcePos = positions[sourceKey];
      if (!sourcePos) continue;

      for (const fk of sourceTable.foreignKeys) {
        const targetTable =
          tables.find(t => t.name === fk.targetTable && t.schema === sourceTable.schema) ||
          tables.find(t => t.name === fk.targetTable);
        if (!targetTable) continue;
        const targetKey = this.tableKey(targetTable);
        const targetPos = positions[targetKey];
        if (!targetPos) continue;

        const srcCol = sourceTable.columns.find(c => c.name === fk.sourceColumn);
        const isOneToOne = Boolean(
          (srcCol?.isUnique && !srcCol.isPrimaryKey) ||
          (srcCol?.isPrimaryKey && sourceTable.primaryKeys.length === 1)
        );

        // Find column index for vertical anchor offset
        const sourceColIdx = Math.max(0, sourceTable.columns.findIndex(c => c.name === fk.sourceColumn));
        const targetColIdx = Math.max(0, targetTable.columns.findIndex(c => c.name === fk.targetColumn));

        const sourceColY = sourcePos.y + 40 + (sourceColIdx + 0.5) * 24;
        const targetColY = targetPos.y + 40 + (targetColIdx + 0.5) * 24;

        // Choose left or right anchor based on relative positions
        const isTargetToTheRight = targetPos.x > sourcePos.x;
        const startX = isTargetToTheRight ? sourcePos.x + sourcePos.width : sourcePos.x;
        const startY = sourceColY;
        const endX = isTargetToTheRight ? targetPos.x : targetPos.x + targetPos.width;
        const endY = targetColY;

        // Bezier control points
        const dx = Math.abs(endX - startX) * 0.5;
        const cx1 = isTargetToTheRight ? startX + dx : startX - dx;
        const cy1 = startY;
        const cx2 = isTargetToTheRight ? endX - dx : endX + dx;
        const cy2 = endY;

        const pathD = `M ${startX} ${startY} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${endX} ${endY}`;

        lines.push({
          id: `${sourceKey}_${fk.sourceColumn}_to_${targetKey}_${fk.targetColumn}`,
          sourceTable: sourceKey,
          sourceCol: fk.sourceColumn,
          targetTable: targetKey,
          targetCol: fk.targetColumn,
          startX,
          startY,
          endX,
          endY,
          pathD,
          oneX: endX + (isTargetToTheRight ? 12 : -12),
          oneY: endY,
          nX: startX + (isTargetToTheRight ? -12 : 12),
          nY: startY,
          cardinalityStart: isOneToOne ? '1' : 'N',
          isOneToOne
        });
      }
    }

    return lines;
  });

  onCanvasMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return; // Only main button
    this.isDraggingCanvas = true;
    this.dragStartX = event.clientX - this.panX();
    this.dragStartY = event.clientY - this.panY();
  }

  onNodeMouseDown(tableName: string, event: MouseEvent): void {
    event.stopPropagation();
    this.isDraggingNode = tableName;
    const pos = this.tablePositions()[tableName];
    if (pos) {
      this.dragStartX = event.clientX;
      this.dragStartY = event.clientY;
      this.nodeStartX = pos.x;
      this.nodeStartY = pos.y;
    }
  }

  onCanvasMouseMove(event: MouseEvent): void {
    if (this.isDraggingNode) {
      const dx = (event.clientX - this.dragStartX) / this.zoom();
      const dy = (event.clientY - this.dragStartY) / this.zoom();
      const positions = { ...this.tablePositions() };
      const currentPos = positions[this.isDraggingNode];
      if (currentPos) {
        positions[this.isDraggingNode] = {
          ...currentPos,
          x: Math.round(this.nodeStartX + dx),
          y: Math.round(this.nodeStartY + dy)
        };
        this.tablePositions.set(positions);
      }
    } else if (this.isDraggingCanvas) {
      this.panX.set(event.clientX - this.dragStartX);
      this.panY.set(event.clientY - this.dragStartY);
    }
  }

  onCanvasMouseUp(): void {
    this.isDraggingCanvas = false;
    this.isDraggingNode = null;
  }

  onTableClick(table: TableSchema, event: MouseEvent): void {
    event.stopPropagation();
    this.selectedTable.set(table);
    this.tableSelected.emit(table);
  }

  zoomIn(): void {
    this.zoom.set(Math.min(2.0, this.zoom() + 0.15));
  }

  zoomOut(): void {
    this.zoom.set(Math.max(0.4, this.zoom() - 0.15));
  }

  fitView(): void {
    this.zoom.set(0.85);
    this.panX.set(40);
    this.panY.set(30);
  }

  reorganizeLayout(): void {
    const scopeKey = `${this.sqlEngine.currentProjectId()}:${this.sqlEngine.currentDbName()}`;
    this.recomputeLayout(this.sqlEngine.currentSchema().tables, scopeKey, true);
    this.fitView();
  }
}
