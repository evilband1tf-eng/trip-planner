import { useState } from 'react';
import { App, Button, Upload } from 'antd';
import type { UploadProps } from 'antd';
import { DeleteOutlined, PictureOutlined } from '@ant-design/icons';
import { imageFileToDataUrl } from '../utils/image';

const MAX_FILE_BYTES = 8 * 1024 * 1024;

interface ImagePickerProps {
  value?: string;
  onChange?: (value: string) => void;
}

/** 与 Form.Item 配合使用的图片选择器：本地读取并压缩，不上传到第三方 */
export function ImagePicker({ value, onChange }: ImagePickerProps) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);

  const beforeUpload: UploadProps['beforeUpload'] = async (file) => {
    if (!file.type.startsWith('image/')) {
      message.error('请选择图片文件');
      return Upload.LIST_IGNORE;
    }
    if (file.size > MAX_FILE_BYTES) {
      message.error('图片不能超过 8MB');
      return Upload.LIST_IGNORE;
    }

    setLoading(true);
    try {
      onChange?.(await imageFileToDataUrl(file));
    } catch {
      message.error('图片读取失败，请换一张试试');
    } finally {
      setLoading(false);
    }
    return Upload.LIST_IGNORE;
  };

  return (
    <div className="image-picker">
      {value ? (
        <div className="image-picker-preview">
          <img src={value} alt="行程封面预览" />
        </div>
      ) : null}

      <div className="image-picker-actions">
        <Upload accept="image/*" maxCount={1} showUploadList={false} beforeUpload={beforeUpload}>
          <Button icon={<PictureOutlined />} loading={loading}>
            {value ? '更换图片' : '上传图片'}
          </Button>
        </Upload>
        {value ? (
          <Button type="text" danger icon={<DeleteOutlined />} onClick={() => onChange?.('')}>
            移除
          </Button>
        ) : null}
      </div>

      <div className="image-picker-tip">支持 jpg / png / webp，图片只保存在浏览器或你的数据库里</div>
    </div>
  );
}
