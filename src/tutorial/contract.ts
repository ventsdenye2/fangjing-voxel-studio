import type {VoxelAsset} from '../core/types';
/** Only the separate tutorial entry supplies this adapter. Desktop behavior is unchanged. */
export interface TutorialAdapter {
  loadExample(): Promise<File[]>;
  convertExample(): VoxelAsset;
  onAction(action:'import'|'convert'|'paint'|'transform'|'save'|'export'): void;
}
