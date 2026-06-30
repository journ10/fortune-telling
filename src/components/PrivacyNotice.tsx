export default function PrivacyNotice() {
  return (
    <p className="privacyNotice">
      手势识别在浏览器本机运行，首次使用会从 MediaPipe CDN 加载识别模型；摄像头画面不会上传。
      摄像头不可用时，可继续使用手动掷钱完成起卦。
    </p>
  );
}
