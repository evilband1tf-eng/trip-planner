import { useRef, useState } from 'react';
import { App, Button, Image, Upload } from 'antd';
import type { UploadProps } from 'antd';
import { DeleteOutlined, PictureOutlined } from '@ant-design/icons';
import { imageFileToDataUrl, MAX_ITEM_IMAGES } from '../utils/image';

const MAX_FILE_BYTES = 8 * 1024 * 1024;

interface ImageListPickerProps {
  value?: string[];
  onChange?: (value: string[]) => void;
}

/** 与 Form.Item 配合使用的多图选择器：本地读取并压缩，最多 9 张，不上传第三方 */
export function ImageListPicker({ value, onChange }: ImageListPickerProps) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const images = value ?? [];

  // 一次选多张时 beforeUpload 会连续触发，用 ref 累积避免后一张覆盖前一张
  const imagesRef = useRef(images);
  imagesRef.current = images;

  const full = images.length >= MAX_ITEM_IMAGES;

  const beforeUpload: UploadProps['beforeUpload'] = async (file) => {
    if (!file.type.startsWith('image/')) {
      message.error('请选择图片文件');
      return Upload.LIST_IGNORE;
    }
    if (file.size > MAX_FILE_BYTES) {
      message.error('单张图片不能超过 8MB');
      return Upload.LIST_IGNORE;
    }
    if (imagesRef.current.length >= MAX_ITEM_IMAGES) {
      message.warning(`最多上传 ${MAX_ITEM_IMAGES} 张图片`);
      return Upload.LIST_IGNORE;
    }

    setLoading(true);
    try {
      const dataUrl = await imageFileToDataUrl(file);
      const next = [...imagesRef.current, dataUrl].slice(0, MAX_ITEM_IMAGES);
      imagesRef.current = next;
      onChange?.(next);
    } catch {
      message.error('图片读取失败，请换一张试试');
    } finally {
      setLoading(false);
    }
    return Upload.LIST_IGNORE;
  };

  const removeAt = (index: number) => {
    onChange?.(images.filter((_, position) => position !== index));
  };

  return (
    <div className="image-picker">
      {images.length > 0 ? (
        <div className="image-list">
          <Image.PreviewGroup>
            {images.map((src, index) => (
              <div className="image-list-item" key={`${index}-${src.slice(-16)}`}>
                <Image src={src} alt={`安排图片 ${index + 1}`} preview={{ mask: null }} />
                <button
                  type="button"
                  className="image-list-remove"
                  aria-label={`移除第 ${index + 1} 张图片`}
                  onClick={() => removeAt(index)}
                >
                  <DeleteOutlined />
                </button>
              </div>
            ))}
          </Image.PreviewGroup>
        </div>
      ) : null}

      <div className="image-picker-actions">
        <Upload accept="image/*" multiple showUploadList={false} beforeUpload={beforeUpload} disabled={full}>
          <Button icon={<PictureOutlined />} loading={loading} disabled={full}>
            {images.length > 0 ? '继续添加' : '上传图片'}
          </Button>
        </Upload>
        <span className="image-picker-count">
          {images.length} / {MAX_ITEM_IMAGES}
        </span>
      </div>

      <div className="image-picker-tip">
        支持 jpg / png / webp，最多 {MAX_ITEM_IMAGES} 张，自动压缩后保存在浏览器或你的数据库里
      </div>
    </div>
  );
}
