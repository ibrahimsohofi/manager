import { useEffect, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "react-i18next";
import * as z from "zod";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Product, Category } from "@/types";
import { api } from "@/services/api";

// Create schema with validation messages
const createFormSchema = (t: (key: string) => string) =>
  z.object({
    name: z.string().min(1, t("validation.nameRequired")),
    description: z.string().optional(),
    category_id: z.number().min(1, t("validation.categoryRequired")),
    purchase_price: z.number().min(0.01, t("validation.purchasePriceMin")),
    selling_price: z.number().min(0.01, t("validation.sellingPriceMin")),
    remaining_stock: z.number().min(0, t("validation.stockMin")),
    min_stock_level: z.number().min(0, t("validation.thresholdMin")),
    image_url: z.string().optional(),
  });

type FormData = z.infer<ReturnType<typeof createFormSchema>>;

interface ProductFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: FormData) => Promise<void>;
  categories: Category[];
  editingProduct?: Product | null;
}

export function ProductForm({
  isOpen,
  onClose,
  onSave,
  categories,
  editingProduct,
}: ProductFormProps) {
  const { t } = useTranslation();
  const formSchema = createFormSchema(t);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      category_id: 0,
      purchase_price: 0,
      selling_price: 0,
      remaining_stock: 0,
      min_stock_level: 10,
      image_url: "",
    },
  });

  // Reset form when editing product changes
  useEffect(() => {
    try {
      if (editingProduct?.id) {
        console.log("Setting form for editing product:", editingProduct);
        form.reset({
          name: editingProduct.name || "",
          description: editingProduct.description || "",
          category_id: Number(editingProduct.category_id) || 0,
          purchase_price: Number(editingProduct.purchase_price) || 0,
          selling_price: Number(editingProduct.selling_price) || 0,
          remaining_stock: Number(editingProduct.remaining_stock) || 0,
          min_stock_level: Number(editingProduct.min_stock_level) || 10,
          image_url: editingProduct.image_url || "",
        });
        setUploadedImage(editingProduct.image_url || null);
      } else {
        console.log("Resetting form for new product");
        form.reset({
          name: "",
          description: "",
          category_id: 0,
          purchase_price: 0,
          selling_price: 0,
          remaining_stock: 0,
          min_stock_level: 10,
          image_url: "",
        });
        setUploadedImage(null);
      }
    } catch (error) {
      console.error("Error in form reset:", error);
      form.reset({
        name: "",
        description: "",
        category_id: 0,
        purchase_price: 0,
        selling_price: 0,
        remaining_stock: 0,
        min_stock_level: 10,
        image_url: "",
      });
      setUploadedImage(null);
    }
  }, [editingProduct, form]);

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error(t("form.imageTypeError"));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      // 5MB limit
      toast.error(t("form.imageSizeError"));
      return;
    }

    setIsUploading(true);
    try {
      const response = await api.uploadImage(file);
      if (response.success && response.imageUrl) {
        setUploadedImage(response.imageUrl);
        form.setValue("image_url", response.imageUrl);
        toast.success(t("form.imageUploadSuccess"));
      } else {
        throw new Error(response.error || "Erreur lors du téléchargement");
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(t("form.imageUploadError"));
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleImageUpload(file);
    }
  };

  const removeImage = async () => {
    if (uploadedImage) {
      try {
        await api.deleteImage(uploadedImage);
      } catch (error) {
        console.error("Error deleting image:", error);
      }
    }
    setUploadedImage(null);
    form.setValue("image_url", "");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (data: FormData) => {
    try {
      await onSave(data);
      form.reset();
      setUploadedImage(null);
      onClose();
    } catch (error) {
      console.error("Error saving product:", error);
    }
  };

  const handleClose = () => {
    form.reset();
    setUploadedImage(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose} >
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-x-hidden bg-background border-border shadow-2xl">
        <DialogHeader className="relative justify-center bg-primary/10  p-4  h-16">
          {/* Decorative header background */}
          <div className="absolute w-full h-16 items-center flex  rounded-t-lg">
            <DialogTitle className="text-2xl font-bold   relative  z-10 text-primary">
              {editingProduct ? t("form.editProduct") : t("form.addProduct")}
            </DialogTitle>
            {/* <DialogDescription className="relative z-10 text-muted-foreground">
              {editingProduct
                ? t("form.editProductDesc")
                : t("form.addProductDesc")}
            </DialogDescription> */}
          </div>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-6 relative px-4 py-2 z-10"
          >
            {/* Product Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold text-foreground">
                    {t("form.productName")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("form.productNamePlaceholder")}
                      {...field}
                      className="bg-background border-border focus:border-primary focus:ring-primary"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold text-foreground">
                    {t("form.description")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("form.descriptionPlaceholder")}
                      {...field}
                      className="bg-background border-border focus:border-primary focus:ring-primary"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Enhanced Image Upload Section */}
            <FormItem>
              <FormLabel className="font-semibold text-foreground">
                {t("form.productImage")}
              </FormLabel>
              <div className="space-y-4">
                {uploadedImage ? (
                  <div className="relative p-4 rounded-xl border-2 border-primary/20 bg-primary/5">
                    <img
                      src={uploadedImage}
                      alt="Product preview"
                      className="w-full h-32 object-cover rounded-lg border-2 border-border shadow-lg"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute top-6 right-6 shadow-lg"
                      onClick={removeImage}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-primary/30 bg-primary/5 rounded-xl p-8 text-center">
                    <div className="flex flex-col items-center space-y-3">
                      <div className="p-3 rounded-full bg-primary/10">
                        <ImageIcon className="h-8 w-8 text-primary" />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground">
                        {t("form.noImageSelected")}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-center space-x-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="default"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="flex items-center space-x-2 shadow-lg"
                  >
                    <Upload className="h-4 w-4" />
                    <span>
                      {isUploading
                        ? t("form.uploading")
                        : t("form.chooseImage")}
                    </span>
                  </Button>
                  {uploadedImage && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={removeImage}
                      className="flex items-center space-x-2 border-destructive/30 text-destructive hover:bg-destructive/10"
                    >
                      <X className="h-4 w-4" />
                      <span>{t("form.removeImage")}</span>
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("form.imageFormats")}
                </p>
              </div>
            </FormItem>

            {/* Category */}
            <FormField
              control={form.control}
              name="category_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-semibold text-foreground">
                    {t("form.category")}
                  </FormLabel>
                  <Select
                    value={field.value.toString()}
                    onValueChange={(value) =>
                      field.onChange(Number.parseInt(value))
                    }
                  >
                    <FormControl>
                      <SelectTrigger className="bg-background border-border focus:border-primary focus:ring-primary">
                        <SelectValue
                          placeholder={t("form.categoryPlaceholder")}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="bg-background border-border">
                      {categories && categories.length > 0 ? (
                        categories.map((category) => (
                          <SelectItem
                            key={category.id}
                            value={category.id.toString()}
                            className="hover:bg-primary/10 focus:bg-primary/10"
                          >
                            {category.name}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="0" disabled>
                          No categories available
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Price Section */}
            <div className="grid grid-cols-2 gap-4 p-4 rounded-xl border border-primary/20 bg-primary/5">
              <FormField
                control={form.control}
                name="purchase_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold text-foreground">
                      {t("form.purchasePrice")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        {...field}
                        onChange={(e) =>
                          field.onChange(Number.parseFloat(e.target.value) || 0)
                        }
                        className="bg-background border-border focus:border-primary focus:ring-primary"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="selling_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold text-foreground">
                      {t("form.sellingPrice")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        {...field}
                        onChange={(e) =>
                          field.onChange(Number.parseFloat(e.target.value) || 0)
                        }
                        className="bg-background border-border focus:border-primary focus:ring-primary"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Stock Section */}
            <div className="grid grid-cols-2 gap-4 p-4 rounded-xl border border-primary/20 bg-primary/5">
              <FormField
                control={form.control}
                name="remaining_stock"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold text-foreground">
                      {t("form.currentStock")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        {...field}
                        onChange={(e) =>
                          field.onChange(Number.parseInt(e.target.value) || 0)
                        }
                        className="bg-background border-border focus:border-primary focus:ring-primary"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="min_stock_level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-semibold text-foreground">
                      {t("form.minThreshold")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        {...field}
                        onChange={(e) =>
                          field.onChange(Number.parseInt(e.target.value) || 0)
                        }
                        className="bg-background border-border focus:border-primary focus:ring-primary"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Enhanced Action Buttons */}
            <div className="flex justify-end space-x-3 pt-6 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                className="border-primary/30 text-primary hover:bg-primary/10"
              >
                {t("form.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={form.formState.isSubmitting || isUploading}
                className="shadow-lg"
              >
                {form.formState.isSubmitting
                  ? t("form.saving")
                  : editingProduct
                    ? t("actions.edit")
                    : t("form.save")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
