// 📁 app/api/rfm/segments/route.ts (修正版)
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const fastApiUrl = process.env.FASTAPI_URL || 'http://python-api:8000';
    console.log('🔗 Getting RFM interpretation from:', fastApiUrl);
    
    // Python APIの解釈ガイドエンドポイントから取得
    const response = await fetch(`${fastApiUrl}/api/rfm/interpretation`);

    if (!response.ok) {
      throw new Error(`FastAPI request failed: ${response.statusText}`);
    }

    const interpretation = await response.json();
    
    // セグメント定義を抽出してレスポンス形式に変換
    const segments = interpretation.segments || {};
    
    // セグメント定義に説明を追加
    const enhancedSegments = {};
    for (const [segmentName, segmentData] of Object.entries(segments)) {
      enhancedSegments[segmentName] = {
        description: getSegmentDescription(segmentName),
        characteristics: segmentData.characteristics,
        action: segmentData.action,
        priority: getSegmentPriority(segmentName)
      };
    }

    console.log('✅ RFM segment definitions retrieved successfully');
    return NextResponse.json({
      success: true,
      segments: enhancedSegments,
      rfm_metrics: interpretation.rfm_metrics,
      score_interpretation: interpretation.score_interpretation,
      segment_count: Object.keys(enhancedSegments).length,
      description: "RFM分析による顧客セグメント定義と解釈ガイド"
    });
    
  } catch (error) {
    console.error('❌ Get RFM segments error:', error);
    return NextResponse.json(
      { error: 'RFMセグメント定義の取得に失敗しました', details: error.message },
      { status: 500 }
    );
  }
}

// セグメント説明を取得する関数
function getSegmentDescription(segmentName: string): string {
  const descriptions = {
    "VIP顧客": "最近購入し、頻繁に購入し、高額な顧客",
    "優良顧客": "最近購入し、適度に購入し、ある程度の金額を使う顧客", 
    "新規顧客": "最近購入したが、まだ頻度や金額が少ない顧客",
    "要注意ヘビーユーザー": "購入頻度・金額は高いが、最近購入していない顧客",
    "安定顧客": "定期的に購入している顧客",
    "見込み顧客": "ポテンシャルがある顧客",
    "離脱した優良顧客": "過去は優良だったが、最近購入していない顧客",
    "離脱しつつある顧客": "購入が減っている顧客",
    "離脱顧客": "購入しなくなった顧客"
  };
  
  return descriptions[segmentName] || "顧客セグメント";
}

// セグメント優先度を取得する関数
function getSegmentPriority(segmentName: string): string {
  const priorities = {
    "VIP顧客": "最高",
    "優良顧客": "高",
    "新規顧客": "高",
    "要注意ヘビーユーザー": "最高",
    "安定顧客": "中",
    "見込み顧客": "中",
    "離脱した優良顧客": "高",
    "離脱しつつある顧客": "中",
    "離脱顧客": "低"
  };
  
  return priorities[segmentName] || "中";
}