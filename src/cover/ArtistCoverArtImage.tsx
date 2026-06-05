import { CoverArtImage, type CoverArtImageProps } from './CoverArtImage';
import { useArtistCoverRef } from './useLibraryCoverRef';
import { COVER_SCOPE_ACTIVE, type CoverServerScope } from './types';

export type ArtistCoverArtImageProps = Omit<CoverArtImageProps, 'coverRef'> & {
  artistId: string;
  coverArt?: string | null;
  serverScope?: CoverServerScope;
  clusterSeedServerId?: string | null;
  libraryResolve?: boolean;
};

export function ArtistCoverArtImage({
  artistId,
  coverArt,
  serverScope,
  clusterSeedServerId,
  libraryResolve = false,
  ...rest
}: ArtistCoverArtImageProps) {
  const coverRef = useArtistCoverRef(
    artistId,
    coverArt,
    serverScope ?? COVER_SCOPE_ACTIVE,
    { libraryResolve, clusterSeedServerId },
  );
  if (!coverRef) return null;
  return <CoverArtImage coverRef={coverRef} {...rest} />;
}
