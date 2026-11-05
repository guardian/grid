interface DestinationSeekInput {
  reverseIndex: number;
  subRowOffset: number;
  backwardItemCount: number;
  bufferLength: number;
  actualOffset: number;
  total: number;
  clampedOffset: number;
}

export function prepareDestinationSeek(input: DestinationSeekInput) {
  const headroom = input.backwardItemCount > 0 && input.reverseIndex < input.backwardItemCount;
  const atRealEnd = input.actualOffset + input.bufferLength >= input.total;
  return {
    reverseIndex: input.reverseIndex + (headroom ? input.backwardItemCount : 0),
    seekSubRowOffset: headroom ? input.subRowOffset : 0,
    atRealEnd,
    endTargetIndex: atRealEnd && input.clampedOffset >= input.total - input.bufferLength
      ? input.bufferLength - 1 : undefined,
  };
}