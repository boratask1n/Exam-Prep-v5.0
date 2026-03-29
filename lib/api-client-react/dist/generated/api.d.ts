import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
import type { CreateQuestionInput, CreateTestInput, Drawing, FilterOptions, HealthStatus, ListQuestionsParams, Question, SaveDrawingInput, TestSession, TestSessionWithQuestions, UpdateQuestionInput, UpdateTestQuestionStatusBody, UpdateTestSessionInput, UploadQuestionImage200, UploadQuestionImageBody } from "./api.schemas";
import { customFetch } from "../custom-fetch";
import type { ErrorType, BodyType } from "../custom-fetch";
type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];
/**
 * @summary Health check
 */
export declare const getHealthCheckUrl: () => string;
export declare const healthCheck: (options?: RequestInit) => Promise<HealthStatus>;
export declare const getHealthCheckQueryKey: () => readonly ["/api/healthz"];
export declare const getHealthCheckQueryOptions: <TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData> & {
    queryKey: QueryKey;
};
export type HealthCheckQueryResult = NonNullable<Awaited<ReturnType<typeof healthCheck>>>;
export type HealthCheckQueryError = ErrorType<unknown>;
/**
 * @summary Health check
 */
export declare function useHealthCheck<TData = Awaited<ReturnType<typeof healthCheck>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof healthCheck>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary List all questions with optional filters
 */
export declare const getListQuestionsUrl: (params?: ListQuestionsParams) => string;
export declare const listQuestions: (params?: ListQuestionsParams, options?: RequestInit) => Promise<Question[]>;
export declare const getListQuestionsQueryKey: (params?: ListQuestionsParams) => readonly ["/api/questions", ...ListQuestionsParams[]];
export declare const getListQuestionsQueryOptions: <TData = Awaited<ReturnType<typeof listQuestions>>, TError = ErrorType<unknown>>(params?: ListQuestionsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listQuestions>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listQuestions>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListQuestionsQueryResult = NonNullable<Awaited<ReturnType<typeof listQuestions>>>;
export type ListQuestionsQueryError = ErrorType<unknown>;
/**
 * @summary List all questions with optional filters
 */
export declare function useListQuestions<TData = Awaited<ReturnType<typeof listQuestions>>, TError = ErrorType<unknown>>(params?: ListQuestionsParams, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listQuestions>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Create a new question
 */
export declare const getCreateQuestionUrl: () => string;
export declare const createQuestion: (createQuestionInput: CreateQuestionInput, options?: RequestInit) => Promise<Question>;
export declare const getCreateQuestionMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createQuestion>>, TError, {
        data: BodyType<CreateQuestionInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createQuestion>>, TError, {
    data: BodyType<CreateQuestionInput>;
}, TContext>;
export type CreateQuestionMutationResult = NonNullable<Awaited<ReturnType<typeof createQuestion>>>;
export type CreateQuestionMutationBody = BodyType<CreateQuestionInput>;
export type CreateQuestionMutationError = ErrorType<unknown>;
/**
 * @summary Create a new question
 */
export declare const useCreateQuestion: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createQuestion>>, TError, {
        data: BodyType<CreateQuestionInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createQuestion>>, TError, {
    data: BodyType<CreateQuestionInput>;
}, TContext>;
/**
 * @summary Get a question by ID
 */
export declare const getGetQuestionUrl: (id: number) => string;
export declare const getQuestion: (id: number, options?: RequestInit) => Promise<Question>;
export declare const getGetQuestionQueryKey: (id: number) => readonly [`/api/questions/${number}`];
export declare const getGetQuestionQueryOptions: <TData = Awaited<ReturnType<typeof getQuestion>>, TError = ErrorType<void>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getQuestion>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getQuestion>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetQuestionQueryResult = NonNullable<Awaited<ReturnType<typeof getQuestion>>>;
export type GetQuestionQueryError = ErrorType<void>;
/**
 * @summary Get a question by ID
 */
export declare function useGetQuestion<TData = Awaited<ReturnType<typeof getQuestion>>, TError = ErrorType<void>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getQuestion>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Update a question
 */
export declare const getUpdateQuestionUrl: (id: number) => string;
export declare const updateQuestion: (id: number, updateQuestionInput: UpdateQuestionInput, options?: RequestInit) => Promise<Question>;
export declare const getUpdateQuestionMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateQuestion>>, TError, {
        id: number;
        data: BodyType<UpdateQuestionInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateQuestion>>, TError, {
    id: number;
    data: BodyType<UpdateQuestionInput>;
}, TContext>;
export type UpdateQuestionMutationResult = NonNullable<Awaited<ReturnType<typeof updateQuestion>>>;
export type UpdateQuestionMutationBody = BodyType<UpdateQuestionInput>;
export type UpdateQuestionMutationError = ErrorType<unknown>;
/**
 * @summary Update a question
 */
export declare const useUpdateQuestion: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateQuestion>>, TError, {
        id: number;
        data: BodyType<UpdateQuestionInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateQuestion>>, TError, {
    id: number;
    data: BodyType<UpdateQuestionInput>;
}, TContext>;
/**
 * @summary Delete a question
 */
export declare const getDeleteQuestionUrl: (id: number) => string;
export declare const deleteQuestion: (id: number, options?: RequestInit) => Promise<void>;
export declare const getDeleteQuestionMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteQuestion>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteQuestion>>, TError, {
    id: number;
}, TContext>;
export type DeleteQuestionMutationResult = NonNullable<Awaited<ReturnType<typeof deleteQuestion>>>;
export type DeleteQuestionMutationError = ErrorType<unknown>;
/**
 * @summary Delete a question
 */
export declare const useDeleteQuestion: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteQuestion>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteQuestion>>, TError, {
    id: number;
}, TContext>;
/**
 * @summary Upload a question image (base64)
 */
export declare const getUploadQuestionImageUrl: () => string;
export declare const uploadQuestionImage: (uploadQuestionImageBody: UploadQuestionImageBody, options?: RequestInit) => Promise<UploadQuestionImage200>;
export declare const getUploadQuestionImageMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof uploadQuestionImage>>, TError, {
        data: BodyType<UploadQuestionImageBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof uploadQuestionImage>>, TError, {
    data: BodyType<UploadQuestionImageBody>;
}, TContext>;
export type UploadQuestionImageMutationResult = NonNullable<Awaited<ReturnType<typeof uploadQuestionImage>>>;
export type UploadQuestionImageMutationBody = BodyType<UploadQuestionImageBody>;
export type UploadQuestionImageMutationError = ErrorType<unknown>;
/**
 * @summary Upload a question image (base64)
 */
export declare const useUploadQuestionImage: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof uploadQuestionImage>>, TError, {
        data: BodyType<UploadQuestionImageBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof uploadQuestionImage>>, TError, {
    data: BodyType<UploadQuestionImageBody>;
}, TContext>;
/**
 * @summary Get drawing data for a question
 */
export declare const getGetDrawingUrl: (id: number) => string;
export declare const getDrawing: (id: number, options?: RequestInit) => Promise<Drawing>;
export declare const getGetDrawingQueryKey: (id: number) => readonly [`/api/questions/${number}/drawing`];
export declare const getGetDrawingQueryOptions: <TData = Awaited<ReturnType<typeof getDrawing>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDrawing>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getDrawing>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetDrawingQueryResult = NonNullable<Awaited<ReturnType<typeof getDrawing>>>;
export type GetDrawingQueryError = ErrorType<unknown>;
/**
 * @summary Get drawing data for a question
 */
export declare function useGetDrawing<TData = Awaited<ReturnType<typeof getDrawing>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getDrawing>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Save drawing data for a question
 */
export declare const getSaveDrawingUrl: (id: number) => string;
export declare const saveDrawing: (id: number, saveDrawingInput: SaveDrawingInput, options?: RequestInit) => Promise<Drawing>;
export declare const getSaveDrawingMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof saveDrawing>>, TError, {
        id: number;
        data: BodyType<SaveDrawingInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof saveDrawing>>, TError, {
    id: number;
    data: BodyType<SaveDrawingInput>;
}, TContext>;
export type SaveDrawingMutationResult = NonNullable<Awaited<ReturnType<typeof saveDrawing>>>;
export type SaveDrawingMutationBody = BodyType<SaveDrawingInput>;
export type SaveDrawingMutationError = ErrorType<unknown>;
/**
 * @summary Save drawing data for a question
 */
export declare const useSaveDrawing: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof saveDrawing>>, TError, {
        id: number;
        data: BodyType<SaveDrawingInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof saveDrawing>>, TError, {
    id: number;
    data: BodyType<SaveDrawingInput>;
}, TContext>;
/**
 * @summary List all test sessions
 */
export declare const getListTestsUrl: () => string;
export declare const listTests: (options?: RequestInit) => Promise<TestSession[]>;
export declare const getListTestsQueryKey: () => readonly ["/api/tests"];
export declare const getListTestsQueryOptions: <TData = Awaited<ReturnType<typeof listTests>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listTests>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof listTests>>, TError, TData> & {
    queryKey: QueryKey;
};
export type ListTestsQueryResult = NonNullable<Awaited<ReturnType<typeof listTests>>>;
export type ListTestsQueryError = ErrorType<unknown>;
/**
 * @summary List all test sessions
 */
export declare function useListTests<TData = Awaited<ReturnType<typeof listTests>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof listTests>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Create a test session
 */
export declare const getCreateTestUrl: () => string;
export declare const createTest: (createTestInput: CreateTestInput, options?: RequestInit) => Promise<TestSession>;
export declare const getCreateTestMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createTest>>, TError, {
        data: BodyType<CreateTestInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof createTest>>, TError, {
    data: BodyType<CreateTestInput>;
}, TContext>;
export type CreateTestMutationResult = NonNullable<Awaited<ReturnType<typeof createTest>>>;
export type CreateTestMutationBody = BodyType<CreateTestInput>;
export type CreateTestMutationError = ErrorType<unknown>;
/**
 * @summary Create a test session
 */
export declare const useCreateTest: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof createTest>>, TError, {
        data: BodyType<CreateTestInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof createTest>>, TError, {
    data: BodyType<CreateTestInput>;
}, TContext>;
/**
 * @summary Get a test session
 */
export declare const getGetTestUrl: (id: number) => string;
export declare const getTest: (id: number, options?: RequestInit) => Promise<TestSessionWithQuestions>;
export declare const getGetTestQueryKey: (id: number) => readonly [`/api/tests/${number}`];
export declare const getGetTestQueryOptions: <TData = Awaited<ReturnType<typeof getTest>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getTest>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getTest>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetTestQueryResult = NonNullable<Awaited<ReturnType<typeof getTest>>>;
export type GetTestQueryError = ErrorType<unknown>;
/**
 * @summary Get a test session
 */
export declare function useGetTest<TData = Awaited<ReturnType<typeof getTest>>, TError = ErrorType<unknown>>(id: number, options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getTest>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
/**
 * @summary Update test session (e.g. mark completed)
 */
export declare const getUpdateTestUrl: (id: number) => string;
export declare const updateTest: (id: number, updateTestSessionInput: UpdateTestSessionInput, options?: RequestInit) => Promise<TestSessionWithQuestions>;
export declare const getUpdateTestMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateTest>>, TError, {
        id: number;
        data: BodyType<UpdateTestSessionInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateTest>>, TError, {
    id: number;
    data: BodyType<UpdateTestSessionInput>;
}, TContext>;
export type UpdateTestMutationResult = NonNullable<Awaited<ReturnType<typeof updateTest>>>;
export type UpdateTestMutationBody = BodyType<UpdateTestSessionInput>;
export type UpdateTestMutationError = ErrorType<unknown>;
/**
 * @summary Update test session (e.g. mark completed)
 */
export declare const useUpdateTest: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateTest>>, TError, {
        id: number;
        data: BodyType<UpdateTestSessionInput>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateTest>>, TError, {
    id: number;
    data: BodyType<UpdateTestSessionInput>;
}, TContext>;
/**
 * @summary Delete a test session
 */
export declare const getDeleteTestUrl: (id: number) => string;
export declare const deleteTest: (id: number, options?: RequestInit) => Promise<void>;
export declare const getDeleteTestMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteTest>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof deleteTest>>, TError, {
    id: number;
}, TContext>;
export type DeleteTestMutationResult = NonNullable<Awaited<ReturnType<typeof deleteTest>>>;
export type DeleteTestMutationError = ErrorType<unknown>;
/**
 * @summary Delete a test session
 */
export declare const useDeleteTest: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof deleteTest>>, TError, {
        id: number;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof deleteTest>>, TError, {
    id: number;
}, TContext>;
/**
 * @summary Update question status within a test (also updates main DB)
 */
export declare const getUpdateTestQuestionStatusUrl: (id: number, questionId: number) => string;
export declare const updateTestQuestionStatus: (id: number, questionId: number, updateTestQuestionStatusBody: UpdateTestQuestionStatusBody, options?: RequestInit) => Promise<Question>;
export declare const getUpdateTestQuestionStatusMutationOptions: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateTestQuestionStatus>>, TError, {
        id: number;
        questionId: number;
        data: BodyType<UpdateTestQuestionStatusBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationOptions<Awaited<ReturnType<typeof updateTestQuestionStatus>>, TError, {
    id: number;
    questionId: number;
    data: BodyType<UpdateTestQuestionStatusBody>;
}, TContext>;
export type UpdateTestQuestionStatusMutationResult = NonNullable<Awaited<ReturnType<typeof updateTestQuestionStatus>>>;
export type UpdateTestQuestionStatusMutationBody = BodyType<UpdateTestQuestionStatusBody>;
export type UpdateTestQuestionStatusMutationError = ErrorType<unknown>;
/**
 * @summary Update question status within a test (also updates main DB)
 */
export declare const useUpdateTestQuestionStatus: <TError = ErrorType<unknown>, TContext = unknown>(options?: {
    mutation?: UseMutationOptions<Awaited<ReturnType<typeof updateTestQuestionStatus>>, TError, {
        id: number;
        questionId: number;
        data: BodyType<UpdateTestQuestionStatusBody>;
    }, TContext>;
    request?: SecondParameter<typeof customFetch>;
}) => UseMutationResult<Awaited<ReturnType<typeof updateTestQuestionStatus>>, TError, {
    id: number;
    questionId: number;
    data: BodyType<UpdateTestQuestionStatusBody>;
}, TContext>;
/**
 * @summary Get distinct filter options (lessons, topics, publishers)
 */
export declare const getGetFilterOptionsUrl: () => string;
export declare const getFilterOptions: (options?: RequestInit) => Promise<FilterOptions>;
export declare const getGetFilterOptionsQueryKey: () => readonly ["/api/filters/options"];
export declare const getGetFilterOptionsQueryOptions: <TData = Awaited<ReturnType<typeof getFilterOptions>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getFilterOptions>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}) => UseQueryOptions<Awaited<ReturnType<typeof getFilterOptions>>, TError, TData> & {
    queryKey: QueryKey;
};
export type GetFilterOptionsQueryResult = NonNullable<Awaited<ReturnType<typeof getFilterOptions>>>;
export type GetFilterOptionsQueryError = ErrorType<unknown>;
/**
 * @summary Get distinct filter options (lessons, topics, publishers)
 */
export declare function useGetFilterOptions<TData = Awaited<ReturnType<typeof getFilterOptions>>, TError = ErrorType<unknown>>(options?: {
    query?: UseQueryOptions<Awaited<ReturnType<typeof getFilterOptions>>, TError, TData>;
    request?: SecondParameter<typeof customFetch>;
}): UseQueryResult<TData, TError> & {
    queryKey: QueryKey;
};
export {};
//# sourceMappingURL=api.d.ts.map