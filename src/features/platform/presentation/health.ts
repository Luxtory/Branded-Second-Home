import { loadEnv, type Env } from '../infrastructure/env';
import { withRoute } from './route';

const NO_STORE = { 'cache-control': 'no-store' };
const SHORT_SHA_LENGTH = 7;

/** GET /v1/health — contrato `getHealth` em docs/api/openapi.yaml. */
export const getHealth = withRoute(() => Response.json({ status: 'ok' }, { headers: NO_STORE }));

/** GET /v1/version — contrato `getVersion` em docs/api/openapi.yaml. */
export function createVersionHandler(readEnv: () => Env = () => loadEnv()) {
  return withRoute(() => {
    const commit = readEnv().VERCEL_GIT_COMMIT_SHA;
    const body =
      commit === undefined
        ? { version: 'unknown' }
        : { version: commit.slice(0, SHORT_SHA_LENGTH), commit };
    return Response.json(body, { headers: NO_STORE });
  });
}

export const getVersion = createVersionHandler();
