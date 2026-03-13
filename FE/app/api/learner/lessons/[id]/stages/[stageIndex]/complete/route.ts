import { NextResponse } from 'next/server';
import { beLearnerRoutes } from '@/lib/apiRoutes';
import { createLearnerAuthHeaders } from '@/lib/learnerAuthCookies';
import { readJsonResponse } from '@/lib/learnerProxy';

export async function POST(req: Request, context: { params: Promise<{ id: string; stageIndex: string }> }) {
  const { id, stageIndex } = await context.params;
  const body = await req.json().catch(() => ({}));
  const response = await fetch(beLearnerRoutes.completeStage(id, Number(stageIndex)), {
    method: 'POST',
    headers: await createLearnerAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });

  const data = await readJsonResponse(response);
  return NextResponse.json(data, { status: response.status });
}
