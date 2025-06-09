// src/app/api/pca/methods/route.ts
export async function GET() {
  try {
    const backendUrl = `${process.env.BACKEND_URL || 'http://localhost:8000'}/pca/methods`;
    
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const data = await response.json();
    
    return Response.json(data, { status: response.status });
  } catch (error) {
    console.error('PCA methods API error:', error);
    return Response.json(
      { error: 'PCA手法一覧取得でエラーが発生しました' },
      { status: 500 }
    );
  }
}
