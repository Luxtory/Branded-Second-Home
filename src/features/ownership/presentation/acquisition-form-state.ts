import type { ErrorCode } from '@/features/platform';
import { unstable_rethrow } from 'next/navigation';
export interface AcquisitionFormState {
  readonly key: string;
  readonly values: Readonly<Record<string, string>>;
  readonly errors: Readonly<Record<string, 'required' | 'invalid' | 'confirmation'>>;
  readonly rejection: ErrorCode | 'invalid' | 'unexpected' | null;
}
export const acquisitionInitialState = (key: string): AcquisitionFormState => ({
  key,
  values: {},
  errors: {},
  rejection: null,
});
export interface MaskedPartyOption {
  readonly id: string;
  readonly documentType: string;
  readonly maskedDocument: string;
}

/** The browser can lose the Server Action response after a commit. Preserve the same attempt for replay. */
export async function retryableAcquisitionSubmission(
  run: (state: AcquisitionFormState, form: FormData) => Promise<AcquisitionFormState>,
  state: AcquisitionFormState,
  form: FormData,
): Promise<AcquisitionFormState> {
  try {
    return await run(state, form);
  } catch (error) {
    // Framework navigation is control flow, not an unconfirmed transport result.
    unstable_rethrow(error);
    const values = Object.fromEntries(
      [...form.entries()].filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === 'string' && !entry[0].startsWith('$ACTION_'),
      ),
    );
    return { ...state, values, errors: {}, rejection: 'unexpected' };
  }
}
