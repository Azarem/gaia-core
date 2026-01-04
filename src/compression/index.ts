import { ICompressionProvider } from '../types/compression';
import { QuintetLZ } from './QuintetLZ';

export * from './QuintetLZ';

export const CompressionAlgorithms = {
    'QuintetLZ': () => new QuintetLZ(),
} as Record<string, () => ICompressionProvider>;
