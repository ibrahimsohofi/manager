import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Package, Home, Search, ArrowLeft, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Navbar } from "./Navbar";

interface ProductNotFoundProps {
  productId?: string | number;
  showBackButton?: boolean;
}

export function ProductNotFound({
  productId,
  showBackButton = true,
}: ProductNotFoundProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <>
    <Navbar/>

    <div className="h-[89.6vh] bg-white dark:bg-gray-900 flex items-center justify-center ">
      <div className="w-full max-w-3xl">
        <Card className="border-none  dark:bg-blue-950/20 max-w-3xl h-[25rem]  shadow-2xl">
          <CardHeader className="text-center pb-6">
            <div className="flex flex-col items-center space-y-4 mb-4">
              <div className="p-4 rounded-full bg-orange-100 dark:bg-orange-900/30">
                <Package className="h-16 w-16 text-orange-600 dark:text-orange-400" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold text-orange-800 dark:text-orange-400">
              {t("errors.title")}
            </CardTitle>
            <Badge variant="secondary" className="mx-auto mt-2 w-fit">
              <AlertTriangle className="h-4 w-4 mr-1" />
              {t("errors.notFound", "404 Error")}
            </Badge>
          </CardHeader>

          <CardContent className="space-y-6 text-center">
            {/* Error Message */}
            <div className="space-y-2">
              <p className="text-gray-600 dark:text-gray-300 text-lg">
                {t(
                  "errors.productNotFound",
                  "The product you're looking for doesn't exist or may have been removed."
                )}
              </p>
            </div>

            {/* Product ID Display */}
            {productId && (
              <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  {t("errors.searchedProductId", "Searched Product ID:")}
                </p>
                <code className="text-lg font-mono text-orange-600 dark:text-orange-400 bg-white dark:bg-gray-900 px-3 py-1 rounded border">
                  {productId}
                </code>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
              {showBackButton && (
                <Button
                  variant="outline"
                  onClick={() => navigate(-1)}
                  className="border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t("actions.goBack")}
                </Button>
              )}

              <Button
                onClick={() => navigate("/")}
                className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg"
              >
                <Home className="h-4 w-4 mr-2" />
                {t("actions.backToDashboard", "Back to Dashboard")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
    </>
  );
}

// Compact version for inline use
export function ProductNotFoundInline({
  productId,
}: {
  productId?: string | number;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-4">
      <div className="p-3 rounded-full bg-orange-100 dark:bg-orange-900/30">
        <Package className="h-12 w-12 text-orange-600 dark:text-orange-400" />
      </div>

      <div className="text-center space-y-2">
        <h3 className="text-lg font-semibold text-orange-800 dark:text-orange-400">
          {t("errors.productNotFound.title", "Product Not Found")}
        </h3>
        <p className="text-gray-600 dark:text-gray-300">
          {productId
            ? t(
                "errors.productNotFound.messageWithId",
                `Product ID "${productId}" not found`
              )
            : t("errors.productNotFound.message", "This product doesn't exist")}
        </p>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          {t("navigation.goBack", "Go Back")}
        </Button>
        <Button
          size="sm"
          onClick={() => navigate("/")}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Home className="h-4 w-4 mr-1" />
          {t("navigation.dashboard", "Dashboard")}
        </Button>
      </div>
    </div>
  );
}
