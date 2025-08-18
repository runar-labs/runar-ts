import { loadRunarFfi } from 'runar-ts-ffi';

export class RunarNodeRuntime {
  private loaded = false;

  load(): void {
    if (this.loaded) return;
    loadRunarFfi();
    this.loaded = true;
  }
}


