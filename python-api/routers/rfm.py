from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Query
from fastapi.responses import JSONResponse, StreamingResponse, Response
from sqlalchemy.orm import Session
import pandas as pd
import numpy as np
import io
import csv
from typing import Optional, List
from datetime import datetime
import os
from models import get_db
from analysis.rfm import RFMAnalysisAnalyzer

router = APIRouter(prefix="/rfm", tags=["rfm"])


@router.post("/analyze")
async def analyze_rfm(
    file: UploadFile = File(...),
    session_name: str = Query(..., description="分析セッション名"),
    description: Optional[str] = Query(None, description="分析の説明"),
    tags: Optional[str] = Query(None, description="タグ（カンマ区切り）"),
    user_id: str = Query("default", description="ユーザーID"),
    customer_id_col: str = Query("id", description="顧客ID列名"),
    date_col: str = Query("date", description="日付列名"),
    amount_col: str = Query("price", description="金額列名"),
    analysis_date: Optional[str] = Query(None, description="分析基準日 (YYYY-MM-DD)"),
    rfm_divisions: int = Query(3, description="RFM分割数", ge=3, le=5),
    use_monetary_4_divisions: bool = Query(False, description="Monetaryを4分割するか"),
    db: Session = Depends(get_db),
):
    """RFM分析を実行"""
    try:
        print(f"=== RFM分析API呼び出し開始 ===")
        print(f"ファイル: {file.filename}")
        print(f"セッション: {session_name}")
        print(f"顧客ID列: {customer_id_col}, 日付列: {date_col}, 金額列: {amount_col}")
        print(f"分析基準日: {analysis_date}, RFM分割数: {rfm_divisions}")

        # ファイル検証
        if not file.filename.endswith(".csv"):
            raise HTTPException(status_code=400, detail="CSVファイルのみ対応しています")

        # CSVファイル読み込み（エンコーディング自動判定）
        contents = await file.read()
        csv_text = None
        encodings = ["utf-8", "shift_jis", "cp932", "euc-jp", "iso-8859-1"]

        for encoding in encodings:
            try:
                csv_text = contents.decode(encoding)
                print(f"✅ エンコーディング: {encoding}")
                break
            except UnicodeDecodeError:
                continue

        if csv_text is None:
            raise HTTPException(status_code=400, detail="対応するエンコーディングが見つかりません")

        print(f"CSVテキスト（最初の500文字）:\n{csv_text[:500]}")

        # CSVをDataFrameに変換
        df = pd.read_csv(io.StringIO(csv_text))
        print(f"データフレーム:\n{df.head()}")
        print(f"列名: {list(df.columns)}")

        if df.empty:
            raise HTTPException(status_code=400, detail="空のファイルです")

        # 必要な列の存在確認
        required_cols = [customer_id_col, date_col, amount_col]
        missing_cols = [col for col in required_cols if col not in df.columns]
        if missing_cols:
            raise HTTPException(
                status_code=400,
                detail=f"必要な列が見つかりません: {missing_cols}. 利用可能な列: {list(df.columns)}",
            )

        # 分析基準日の検証
        if analysis_date:
            try:
                datetime.strptime(analysis_date, "%Y-%m-%d")
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail="分析基準日の形式が正しくありません。YYYY-MM-DD形式で入力してください。",
                )

        # タグ処理
        tag_list = [tag.strip() for tag in tags.split(",")] if tags else []

        # 分析実行
        analyzer = RFMAnalysisAnalyzer()
        response_data = analyzer.run_full_analysis(
            df=df,
            db=db,
            session_name=session_name,
            description=description,
            tags=tag_list,
            user_id=user_id,
            file=file,
            csv_text=csv_text,
            customer_id_col=customer_id_col,
            date_col=date_col,
            amount_col=amount_col,
            analysis_date=analysis_date,
            rfm_divisions=rfm_divisions,
            use_monetary_4_divisions=use_monetary_4_divisions,
        )

        print("=== RFM分析API処理完了 ===")
        return JSONResponse(content=response_data)

    except HTTPException:
        raise
    except Exception as e:
        print(f"=== RFM分析API処理エラー ===")
        print(f"エラー: {str(e)}")
        import traceback
        print(f"詳細:\n{traceback.format_exc()}")

        raise HTTPException(
            status_code=500, detail=f"RFM分析中にエラーが発生しました: {str(e)}"
        )


@router.get("/methods")
async def get_rfm_methods():
    """RFM分析で利用可能な手法一覧を取得"""
    methods = {
        "rfm_divisions": [
            {
                "value": 3,
                "name": "3分割",
                "description": "低・中・高の3段階でRFM値を分割",
            },
            {
                "value": 4,
                "name": "4分割",
                "description": "より細かい4段階でRFM値を分割",
            },
            {
                "value": 5,
                "name": "5分割",
                "description": "最も細かい5段階でRFM値を分割",
            },
        ],
        "segment_definitions": {
            "VIP顧客": "最近購入し、頻繁に購入し、高額な顧客",
            "優良顧客": "最近購入し、適度に購入し、ある程度の金額を使う顧客",
            "新規顧客": "最近購入したが、まだ頻度や金額が少ない顧客",
            "要注意ヘビーユーザー": "購入頻度・金額は高いが、最近購入していない顧客",
            "安定顧客": "定期的に購入している顧客",
            "見込み顧客": "ポテンシャルがある顧客",
            "離脱した優良顧客": "過去は優良だったが、最近購入していない顧客",
            "離脱しつつある顧客": "購入が減っている顧客",
            "離脱顧客": "購入しなくなった顧客",
        },
        "required_columns": {
            "customer_id": "顧客を識別するための列（例: id, customer_id）",
            "date": "購入日付の列（例: date, purchase_date）",
            "amount": "購入金額の列（例: price, amount, total）",
        },
        "guidelines": {
            "minimum_data_period": "最低3ヶ月間のデータを推奨",
            "minimum_customers": "最低50人の顧客データを推奨",
            "date_format": "日付は YYYY-MM-DD, YYYY/MM/DD などの形式に対応",
            "analysis_date": "分析基準日を指定しない場合は、データの最終日の翌日を使用",
        },
    }

    return methods


@router.get("/parameters/validate")
async def validate_rfm_parameters(
    customer_id_col: str = Query("id", description="顧客ID列名"),
    date_col: str = Query("date", description="日付列名"),
    amount_col: str = Query("price", description="金額列名"),
    analysis_date: Optional[str] = Query(None, description="分析基準日"),
    rfm_divisions: int = Query(3, description="RFM分割数"),
):
    """RFM分析パラメータの検証"""
    validation_result = {"valid": True, "warnings": [], "errors": []}

    # 列名の検証
    if not customer_id_col.strip():
        validation_result["errors"].append("顧客ID列名は必須です")
        validation_result["valid"] = False

    if not date_col.strip():
        validation_result["errors"].append("日付列名は必須です")
        validation_result["valid"] = False

    if not amount_col.strip():
        validation_result["errors"].append("金額列名は必須です")
        validation_result["valid"] = False

    # 分析基準日の検証
    if analysis_date:
        try:
            datetime.strptime(analysis_date, "%Y-%m-%d")
        except ValueError:
            validation_result["errors"].append(
                "分析基準日の形式が正しくありません。YYYY-MM-DD形式で入力してください。"
            )
            validation_result["valid"] = False

    # RFM分割数の検証
    if rfm_divisions < 3:
        validation_result["errors"].append("RFM分割数は3以上である必要があります")
        validation_result["valid"] = False
    elif rfm_divisions > 5:
        validation_result["warnings"].append(
            "RFM分割数が多すぎる可能性があります（推奨: 3-5）"
        )

    return validation_result


@router.get("/interpretation")
async def get_interpretation_guide():
    """RFM分析結果の解釈ガイドを取得"""
    return {
        "rfm_metrics": {
            "recency": {
                "description": "最終購入からの経過日数",
                "interpretation": "値が小さいほど良い（最近購入している）",
            },
            "frequency": {
                "description": "購入回数",
                "interpretation": "値が大きいほど良い（頻繁に購入している）",
            },
            "monetary": {
                "description": "購入金額合計",
                "interpretation": "値が大きいほど良い（多く購入している）",
            },
        },
        "segments": {
            "VIP顧客": {
                "characteristics": "R=高, F=高, M=高",
                "action": "関係維持、プレミアムサービス提供",
            },
            "優良顧客": {
                "characteristics": "R=高, F=中-高, M=中-高",
                "action": "アップセル、クロスセル",
            },
            "新規顧客": {
                "characteristics": "R=高, F=低, M=低",
                "action": "オンボーディング、リテンション強化",
            },
            "要注意ヘビーユーザー": {
                "characteristics": "R=低, F=高, M=高",
                "action": "緊急リテンション施策",
            },
            "安定顧客": {
                "characteristics": "R=中, F=中, M=中",
                "action": "定期的なコミュニケーション",
            },
            "離脱顧客": {
                "characteristics": "R=低, F=低, M=低",
                "action": "ウィンバック施策",
            },
        },
        "score_interpretation": {
            "high_scores": "9以上: 最優良顧客",
            "medium_scores": "6-8: 一般顧客",
            "low_scores": "3-5: 要改善顧客",
        },
    }


@router.get("/sessions/{session_id}")
async def get_rfm_session_detail(
    session_id: int,
    db: Session = Depends(get_db),
):
    """RFM分析セッション詳細を取得"""
    try:
        print(f"📊 RFM分析セッション詳細取得開始: {session_id}")

        # RFMAnalysisAnalyzerのインスタンスを作成
        analyzer = RFMAnalysisAnalyzer()

        # セッション詳細を取得
        session_detail = await analyzer.get_session_detail(session_id, db)

        print(f"🔍 取得されたセッション詳細: {session_detail.get('success', False)}")

        if not session_detail or not session_detail.get("success"):
            error_msg = (
                session_detail.get("error", f"セッション {session_id} が見つかりません")
                if session_detail
                else f"セッション {session_id} が見つかりません"
            )
            raise HTTPException(status_code=404, detail=error_msg)

        return JSONResponse(content=session_detail)

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ RFM分析セッション詳細取得エラー: {str(e)}")
        import traceback
        print(f"詳細:\n{traceback.format_exc()}")

        raise HTTPException(
            status_code=500,
            detail=f"セッション詳細の取得中にエラーが発生しました: {str(e)}",
        )


@router.get("/download/{session_id}/details")
async def download_rfm_details(session_id: int, db: Session = Depends(get_db)):
    """RFM分析結果詳細をCSV形式でダウンロード"""
    try:
        from models import AnalysisSession, AnalysisMetadata, CoordinatesData

        print(f"Starting RFM details download for session: {session_id}")

        # セッション情報を取得
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )
        if not session:
            raise HTTPException(status_code=404, detail="セッションが見つかりません")

        if session.analysis_type != "rfm":
            raise HTTPException(
                status_code=400, detail="RFM分析のセッションではありません"
            )

        print(f"Session found: {session.session_name}")

        # 顧客データを取得
        customer_data = (
            db.query(CoordinatesData)
            .filter(
                CoordinatesData.session_id == session_id,
                CoordinatesData.point_type == "customer",
            )
            .all()
        )

        # メタデータを取得
        metadata_entries = (
            db.query(AnalysisMetadata)
            .filter(AnalysisMetadata.session_id == session_id)
            .all()
        )

        print(
            f"Found {len(customer_data)} customers, {len(metadata_entries)} metadata entries"
        )

        # CSVデータを作成
        output = io.StringIO()
        writer = csv.writer(output)

        # セッション情報
        writer.writerow(["セッション情報"])
        writer.writerow(["項目", "値"])
        writer.writerow(["セッション名", session.session_name])
        writer.writerow(["ファイル名", session.original_filename])
        writer.writerow(["分析手法", "RFM分析"])
        writer.writerow(
            ["分析日時", session.analysis_timestamp.strftime("%Y-%m-%d %H:%M:%S")]
        )
        writer.writerow(["データ行数", session.row_count])
        writer.writerow(["総顧客数", len(customer_data)])
        writer.writerow([])

        # RFM統計情報
        rfm_stats = None
        for meta in metadata_entries:
            if meta.metadata_type == "rfm_statistics":
                rfm_stats = meta.metadata_content
                break

        if rfm_stats:
            writer.writerow(["RFM統計情報"])

            # Recency統計
            writer.writerow(["Recency統計"])
            writer.writerow(["項目", "値"])
            r_stats = rfm_stats.get("rfm_stats", {}).get("recency", {})
            writer.writerow(["平均", f"{r_stats.get('mean', 0):.2f}"])
            writer.writerow(["標準偏差", f"{r_stats.get('std', 0):.2f}"])
            writer.writerow(["最小値", f"{r_stats.get('min', 0):.2f}"])
            writer.writerow(["最大値", f"{r_stats.get('max', 0):.2f}"])
            writer.writerow([])

            # Frequency統計
            writer.writerow(["Frequency統計"])
            writer.writerow(["項目", "値"])
            f_stats = rfm_stats.get("rfm_stats", {}).get("frequency", {})
            writer.writerow(["平均", f"{f_stats.get('mean', 0):.2f}"])
            writer.writerow(["標準偏差", f"{f_stats.get('std', 0):.2f}"])
            writer.writerow(["最小値", f"{f_stats.get('min', 0):.2f}"])
            writer.writerow(["最大値", f"{f_stats.get('max', 0):.2f}"])
            writer.writerow([])

            # Monetary統計
            writer.writerow(["Monetary統計"])
            writer.writerow(["項目", "値"])
            m_stats = rfm_stats.get("rfm_stats", {}).get("monetary", {})
            writer.writerow(["平均", f"{m_stats.get('mean', 0):.2f}"])
            writer.writerow(["標準偏差", f"{m_stats.get('std', 0):.2f}"])
            writer.writerow(["最小値", f"{m_stats.get('min', 0):.2f}"])
            writer.writerow(["最大値", f"{m_stats.get('max', 0):.2f}"])
            writer.writerow([])

            # セグメント分布
            segment_counts = rfm_stats.get("segment_counts", {})
            if segment_counts:
                writer.writerow(["セグメント分布"])
                writer.writerow(["セグメント", "顧客数", "割合(%)"])
                total_customers = sum(segment_counts.values())
                for segment, count in segment_counts.items():
                    percentage = (
                        (count / total_customers * 100) if total_customers > 0 else 0
                    )
                    writer.writerow([segment, count, f"{percentage:.1f}"])
                writer.writerow([])

        # 顧客詳細データ
        writer.writerow(["顧客詳細データ"])
        writer.writerow(
            [
                "顧客ID",
                "Recency",
                "Frequency",
                "Monetary",
                "RFMスコア",
                "Rスコア",
                "Fスコア",
                "Mスコア",
                "セグメント",
            ]
        )

        for customer in customer_data:
            metadata = customer.metadata_json or {}
            writer.writerow(
                [
                    customer.point_name,
                    f"{customer.dimension_1:.2f}" if customer.dimension_1 else "0.00",
                    f"{customer.dimension_2:.2f}" if customer.dimension_2 else "0.00",
                    f"{customer.dimension_3:.2f}" if customer.dimension_3 else "0.00",
                    f"{customer.dimension_4:.2f}" if customer.dimension_4 else "0.00",
                    metadata.get("r_score", ""),
                    metadata.get("f_score", ""),
                    metadata.get("m_score", ""),
                    metadata.get("segment", ""),
                ]
            )

        # CSV内容を取得
        csv_content = output.getvalue()
        output.close()

        print(f"Generated CSV content length: {len(csv_content)} characters")

        # ファイル名設定
        filename = f"rfm_details_{session_id}.csv"

        # Responseを作成
        return Response(
            content=csv_content.encode("utf-8-sig"),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"詳細CSV出力エラー: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500, detail=f"詳細CSV出力中にエラーが発生しました: {str(e)}"
        )


@router.get("/download/{session_id}/customers")
async def download_customers_csv(session_id: int, db: Session = Depends(get_db)):
    """データベースからRFM顧客データをCSVでダウンロード"""
    try:
        from fastapi import Response
        from sqlalchemy import text
        import io
        import csv
        import json

        print(f"=== 顧客データCSVダウンロード: session_id={session_id} ===")

        # データベースから顧客データを取得
        query = text(
            """
            SELECT 
                point_name as customer_id,
                dimension_1 as recency,
                dimension_2 as frequency, 
                dimension_3 as monetary,
                dimension_4 as rfm_score,
                metadata_json
            FROM coordinates_data 
            WHERE session_id = :session_id AND point_type = 'customer'
            ORDER BY point_name::integer
        """
        )

        result = db.execute(query, {"session_id": session_id})
        rows = result.fetchall()

        if not rows:
            raise HTTPException(
                status_code=404,
                detail=f"セッション {session_id} の顧客データが見つかりません",
            )

        print(f"データベースから {len(rows)} 件の顧客データを取得")

        # CSV形式に変換
        output = io.StringIO()
        writer = csv.writer(output)

        # ヘッダー（BOMつきUTF-8対応）
        writer.writerow(
            [
                "customer_id",
                "recency",
                "frequency",
                "monetary",
                "rfm_score",
                "r_score",
                "f_score",
                "m_score",
                "segment",
            ]
        )

        # データ行
        successful_rows = 0
        for row in rows:
            try:
                # metadata_jsonの処理
                if row.metadata_json:
                    if isinstance(row.metadata_json, dict):
                        metadata = row.metadata_json
                    elif isinstance(row.metadata_json, str):
                        metadata = json.loads(row.metadata_json)
                    else:
                        metadata = {}
                else:
                    metadata = {}

                writer.writerow(
                    [
                        row.customer_id,
                        round(float(row.recency), 2),
                        round(float(row.frequency), 2),
                        round(float(row.monetary), 2),
                        round(float(row.rfm_score), 2),
                        metadata.get("r_score", ""),
                        metadata.get("f_score", ""),
                        metadata.get("m_score", ""),
                        metadata.get("segment", ""),
                    ]
                )

                successful_rows += 1

            except Exception as e:
                print(f"行処理エラー（customer_id: {row.customer_id}）: {e}")
                continue

        csv_content = output.getvalue()
        output.close()

        print(f"CSV生成完了: {len(csv_content)} 文字, 成功行数: {successful_rows}")

        return Response(
            content=csv_content.encode("utf-8-sig"),
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="rfm_customers_session_{session_id}.csv"'
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ 顧客データダウンロードエラー: {str(e)}")
        import traceback
        print(f"詳細:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download/{session_id}/segments")
async def download_rfm_segments(session_id: int, db: Session = Depends(get_db)):
    """セグメント別統計をCSV形式でダウンロード"""
    try:
        from models import AnalysisSession, CoordinatesData
        import pandas as pd

        print(f"=== セグメント統計ダウンロード開始: セッション {session_id} ===")

        # セッション情報を取得
        session = (
            db.query(AnalysisSession).filter(AnalysisSession.id == session_id).first()
        )

        if not session:
            raise HTTPException(
                status_code=404, detail=f"セッション {session_id} が見つかりません"
            )

        if session.analysis_type != "rfm":
            raise HTTPException(
                status_code=400,
                detail=f"RFM分析のセッションではありません: {session.analysis_type}",
            )

        # 顧客データを取得
        customers = (
            db.query(CoordinatesData)
            .filter(
                CoordinatesData.session_id == session_id,
                CoordinatesData.point_type == "customer",
            )
            .all()
        )

        if not customers:
            raise HTTPException(status_code=404, detail="顧客データが見つかりません")

        # DataFrameに変換
        data_list = []
        for customer in customers:
            metadata = customer.metadata_json or {}
            data_list.append(
                {
                    "customer_id": customer.point_name,
                    "recency": customer.dimension_1 or 0,
                    "frequency": customer.dimension_2 or 0,
                    "monetary": customer.dimension_3 or 0,
                    "rfm_score": customer.dimension_4 or 0,
                    "segment": metadata.get("segment", "不明"),
                }
            )

        df = pd.DataFrame(data_list)

        # セグメント別統計を計算
        segment_stats = (
            df.groupby("segment")
            .agg(
                {
                    "customer_id": "count",
                    "recency": "mean",
                    "frequency": "mean",
                    "monetary": "mean",
                    "rfm_score": "mean",
                }
            )
            .round(2)
        )

        # パーセンテージを追加
        total_customers = len(df)
        segment_stats["percentage"] = (
            segment_stats["customer_id"] / total_customers * 100
        ).round(1)

        # 列名を日本語に変更
        segment_stats.columns = [
            "customer_count",
            "avg_recency",
            "avg_frequency",
            "avg_monetary",
            "avg_rfm_score",
            "percentage",
        ]

        # インデックスを列に変換
        segment_stats = segment_stats.reset_index()
        segment_stats.columns = [
            "segment",
            "customer_count",
            "avg_recency",
            "avg_frequency",
            "avg_monetary",
            "avg_rfm_score",
            "percentage",
        ]

        # CSVとして出力
        csv_content = segment_stats.to_csv(index=False, encoding="utf-8")
        print(f"セグメント統計CSV生成完了: {len(segment_stats)} セグメント")

        filename = f"rfm_segments_{session_id}.csv"
        csv_bytes = csv_content.encode("utf-8-sig")

        return Response(
            content=csv_bytes,
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Type": "text/csv; charset=utf-8",
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ セグメント統計CSV出力エラー: {str(e)}")
        import traceback
        print(f"詳細:\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"セグメント統計CSV出力中にエラーが発生しました: {str(e)}",
        )