from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    Text,
    DECIMAL,
    TIMESTAMP,
    ForeignKey,
    LargeBinary,
    ARRAY,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime
import os

# データベース接続設定
DATABASE_URL = f"postgresql://{os.getenv('DB_USER', 'user')}:{os.getenv('DB_PASSWORD', 'password')}@{os.getenv('DB_HOST', 'db')}:{os.getenv('DB_PORT', '5432')}/{os.getenv('DB_NAME', 'analysis')}"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class AnalysisSession(Base):
    __tablename__ = "analysis_sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_name = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=False)
    file_size = Column(Integer)
    upload_timestamp = Column(TIMESTAMP, default=datetime.utcnow)
    analysis_timestamp = Column(TIMESTAMP, default=datetime.utcnow)
    description = Column(Text)
    tags = Column(ARRAY(String))
    user_id = Column(String(100))

    # 分析結果の統計情報
    total_inertia = Column(DECIMAL(10, 8))
    chi2_value = Column(DECIMAL(15, 4))
    degrees_of_freedom = Column(Integer)
    row_count = Column(Integer)
    column_count = Column(Integer)

    # 次元数と寄与率
    dimensions_count = Column(Integer, default=2)
    dimension_1_contribution = Column(DECIMAL(8, 6))
    dimension_2_contribution = Column(DECIMAL(8, 6))

    # 分析設定
    analysis_parameters = Column(JSONB)

    created_at = Column(TIMESTAMP, default=datetime.utcnow)
    updated_at = Column(TIMESTAMP, default=datetime.utcnow)

    # リレーション
    original_data = relationship(
        "OriginalData", back_populates="session", cascade="all, delete-orphan"
    )
    coordinates = relationship(
        "CoordinatesData", back_populates="session", cascade="all, delete-orphan"
    )
    visualizations = relationship(
        "VisualizationData", back_populates="session", cascade="all, delete-orphan"
    )
    eigenvalues = relationship(
        "EigenvalueData", back_populates="session", cascade="all, delete-orphan"
    )


class OriginalData(Base):
    __tablename__ = "original_data"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("analysis_sessions.id"), nullable=False)
    csv_data = Column(Text, nullable=False)
    row_names = Column(ARRAY(String))
    column_names = Column(ARRAY(String))
    data_matrix = Column(JSONB)

    # リレーション
    session = relationship("AnalysisSession", back_populates="original_data")


class CoordinatesData(Base):
    __tablename__ = "coordinates_data"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("analysis_sessions.id"), nullable=False)
    point_type = Column(String(20), nullable=False)  # 'row' or 'column'
    point_name = Column(String(255), nullable=False)
    dimension_1 = Column(DECIMAL(12, 8))
    dimension_2 = Column(DECIMAL(12, 8))
    contribution_dim1 = Column(DECIMAL(8, 6))
    contribution_dim2 = Column(DECIMAL(8, 6))
    quality_representation = Column(DECIMAL(8, 6))

    # 追加の次元
    dimension_3 = Column(DECIMAL(12, 8))
    dimension_4 = Column(DECIMAL(12, 8))

    # リレーション
    session = relationship("AnalysisSession", back_populates="coordinates")


class VisualizationData(Base):
    __tablename__ = "visualization_data"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("analysis_sessions.id"), nullable=False)
    image_type = Column(String(50), default="correspondence_plot")
    image_data = Column(LargeBinary, nullable=False)
    image_base64 = Column(Text)
    image_size = Column(Integer)
    width = Column(Integer)
    height = Column(Integer)
    dpi = Column(Integer, default=300)
    created_at = Column(TIMESTAMP, default=datetime.utcnow)

    # リレーション
    session = relationship("AnalysisSession", back_populates="visualizations")


class EigenvalueData(Base):
    __tablename__ = "eigenvalue_data"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("analysis_sessions.id"), nullable=False)
    dimension_number = Column(Integer, nullable=False)
    eigenvalue = Column(DECIMAL(12, 8))
    explained_inertia = Column(DECIMAL(8, 6))
    cumulative_inertia = Column(DECIMAL(8, 6))

    # リレーション
    session = relationship("AnalysisSession", back_populates="eigenvalues")


# データベースの依存性注入用
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# テーブル作成
def create_tables():
    Base.metadata.create_all(bind=engine)
