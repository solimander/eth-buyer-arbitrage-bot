import retry from 'async-retry';
import { GraphQLClient } from 'graphql-request';
import { RequestDocument, Variables } from 'graphql-request/dist/types';
import { isError, tryF } from 'ts-try';

interface GraphQLPaginableField {
  id: string;
}

export interface GraphQLRequestInfo {
  document: RequestDocument;
  variables?: Variables;
  requestHeaders?: any;
}

/**
 * Async iterator to promisified array
 */
export const asyncIterableToPromise = async <T>(iterable: AsyncIterable<T[]>): Promise<T[]> => {
  let out: T[] = [];
  for await (const entities of iterable) {
    out = out.concat(entities);
  }
  return out;
};

export class GraphQLPaginationClient extends GraphQLClient {
  public static DEFAULT_LIMIT = 1000;

  public async *paginate<R extends GraphQLPaginableField>(
    accessor: string,
    { document, variables, requestHeaders }: GraphQLRequestInfo,
    opts?: retry.Options,
  ): AsyncIterable<R[]> {
    let cursor: string | undefined = '';

    const limit = variables?.first || GraphQLPaginationClient.DEFAULT_LIMIT;
    while (cursor !== undefined) {
      const result = await tryF(async () =>
        retry(
          () =>
            this.request<Record<string, R[]>, Variables>(
              document,
              { ...variables, cursor },
              requestHeaders,
            ),
          opts,
        ),
      );

      if (isError(result)) {
        throw result;
      }

      const fields = result[accessor];
      yield fields;
      cursor = fields.length === limit ? fields[fields.length - 1].id : undefined;
    }
  }
}
