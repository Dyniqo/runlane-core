export interface CursorPageQueryDto {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface CursorPageDto<Item> {
  readonly items: readonly Item[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}
